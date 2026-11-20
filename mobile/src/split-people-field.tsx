import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { Field, useTheme } from "./ui";

export type SavedPerson = { name: string };

export function mergePeople(selected: string[], additions: string[], saved: SavedPerson[]) {
  const canonical = new Map(saved.map(p => [p.name.trim().toLowerCase(), p.name.trim()]));
  const names = new Map<string, string>();
  for (const raw of [...selected, ...additions]) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name && !names.has(key)) names.set(key, canonical.get(key) ?? name);
  }
  return [...names.values()];
}

export function PeopleSuggestions({draft, selected, saved, choose}: {
  draft: string; selected: string[]; saved: SavedPerson[]; choose: (name: string) => void;
}) {
  const {colors} = useTheme();
  const query = draft.trim().toLowerCase();
  if (!query) return null;
  const chosen = new Set(selected.map(name => name.trim().toLowerCase()));
  return <>{saved.filter(p => p.name.toLowerCase().includes(query) && !chosen.has(p.name.toLowerCase())).slice(0, 8).map(p =>
    <Pressable key={p.name} accessibilityRole="button" accessibilityLabel={`Use ${p.name}`} onPress={() => choose(p.name)}
      style={{minHeight:44, justifyContent:"center", borderBottomWidth:1, borderColor:colors.line}}>
      <Text style={{color:colors.ink}}>{p.name}</Text>
    </Pressable>)}</>;
}

export function SplitPeopleField({selected, draft, saved, onChange, onDraft, disabled}: {
  selected: string[]; draft: string; saved: SavedPerson[]; onChange:(names:string[])=>void; onDraft:(draft:string)=>void; disabled:boolean;
}) {
  const {colors} = useTheme();
  function commit(additions: string[], remaining = "") {
    onChange(mergePeople(selected, additions, saved));
    onDraft(remaining);
  }
  return <View style={{gap:6}} pointerEvents={disabled ? "none" : "auto"}>
    <Field label="People" placeholder="Add a name" value={draft} editable={!disabled}
      returnKeyType="done" submitBehavior="submit" autoCapitalize="words"
      onChangeText={text => {
        const parts = text.split(/[,\n]/);
        const remaining = parts.pop() ?? "";
        if (parts.length) commit(parts, remaining);
        else onDraft(remaining);
      }}
      onSubmitEditing={event => commit([event.nativeEvent.text])}
      trailing={<Pressable accessibilityLabel="Add Person" accessibilityRole="button" disabled={disabled || !draft.trim()}
        onPress={() => commit([draft])} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}>
        <Text style={{fontSize:24,color:colors.teal}}>+</Text>
      </Pressable>}/>
    {selected.length > 0 && <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>
      {selected.map((name,index) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Remove ${name}`}
        onPress={() => onChange(selected.filter(n => n !== name))}
        style={{borderRadius:18,paddingHorizontal:12,paddingVertical:7,backgroundColor:["#cff4ed","#dbeafb","#f5e2f1"][index % 3]}}>
        <Text style={{color:"#17373c"}}>{name} ×</Text>
      </Pressable>)}
    </View>}
    <PeopleSuggestions draft={draft} selected={selected} saved={saved} choose={name => commit([name])}/>
  </View>;
}
