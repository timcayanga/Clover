// Temporary native verification entry. Not part of the shipped app.
import {registerRootComponent} from 'expo';
import {useEffect,useState} from 'react';
import {Text,ScrollView,Platform} from 'react-native';
import * as FS from 'expo-file-system/legacy';
import {File} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import {openOfflineStore} from '../src/offline/store';
import {CloverLocalAI} from '../modules/clover-local-ai';
function NativeQA(){const [output,setOutput]=useState('Running native offline checks…');useEffect(()=>{void(async()=>{
 const results:Record<string,unknown>={platform:Platform.OS,checks:[]};const checks=results.checks as string[];
 try{const identity='clover-native-offline-qa-v1';let store=await openOfflineStore(identity);await store.set('fixture',{marker:'CLOVER_OFFLINE_QA_PLAINTEXT',value:42});await store.close();
 store=await openOfflineStore(identity);const value=await store.get<{value:number}>('fixture');if(value?.value!==42)throw new Error('Encrypted restart failed');checks.push('SQLCipher encrypted storage persists across reopen');await store.close();
 const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,identity),directory=SQLite.defaultDatabaseDirectory+'/clover-private';const raw=new File((directory.startsWith('file:')?'':'file://')+directory+'/clover-'+hash+'.db');const bytes=await raw.bytes();const text=Array.from(bytes,b=>String.fromCharCode(b)).join('');if(text.includes('CLOVER_OFFLINE_QA_PLAINTEXT')||text.startsWith('SQLite format 3'))throw new Error('Plaintext database found');checks.push('Database file does not expose plaintext/header');
 const wrong=await SQLite.openDatabaseAsync('clover-'+hash+'.db',{},directory);let rejected=false;try{await wrong.execAsync(`PRAGMA key = "x'${'00'.repeat(32)}'";`);await wrong.getFirstAsync('SELECT * FROM offline_data');}catch{rejected=true;}finally{await wrong.closeAsync();}if(!rejected)throw new Error('Wrong key accepted');checks.push('Incorrect encryption key rejected');
 store=await openOfflineStore(identity);await store.clear();if((await store.keys('')).length)throw new Error('Purge failed');await store.close();checks.push('Explicit local purge removes stored data');
 results.capability=await CloverLocalAI?.capabilities();if(!results.capability)throw new Error('Native AI module missing');checks.push('Native capability check responds');
 const raceIdentity=identity+'-race-'+Crypto.randomUUID();const [one,two]=await Promise.all([openOfflineStore(raceIdentity),openOfflineStore(raceIdentity)]);await one.set('race',42);if(await two.get('race')!==42)throw new Error('Concurrent key creation failed');await one.clear();await one.close();await two.close();checks.push('Concurrent first opens share the same encryption key');
 if(await FS.getInfoAsync(FS.documentDirectory+'qa-receipt.png').then(v=>v.exists)){const ocr=await CloverLocalAI!.extractText(FS.documentDirectory+'qa-receipt.png');if(!ocr.text.includes('125.00'))throw new Error('Synthetic receipt OCR failed');results.ocr=ocr;checks.push('Native OCR reads synthetic receipt amount');}
 if((results.capability as {model:string}).model==='available'){results.inference=await CloverLocalAI!.generate('Explain this synthetic Clover summary in one short sentence: PHP income 2000.00, spending 500.00. These are downloaded records. Do not calculate new figures.');if(typeof results.inference!=='string'||!results.inference)throw new Error('Local inference returned no response');checks.push('Available on-device model generates a response');}
 results.ok=true;
 }catch(e){results.ok=false;results.error=(e as Error).message;}
 const json=JSON.stringify(results,null,2);await FS.writeAsStringAsync(FS.documentDirectory+'clover-offline-native-qa.json',json);setOutput(json);console.log('CLOVER_OFFLINE_NATIVE_QA',json);
 })();},[]);return <ScrollView contentContainerStyle={{padding:32,paddingTop:80}}><Text selectable style={{fontSize:18}}>{output}</Text></ScrollView>;}
registerRootComponent(NativeQA);
