import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './app-text';
import { useSession } from './session';
import { registerScreenRefresh } from './screen-refresh';
import { Body, Card, Icon, money, useTheme } from './ui';
import type { PendingSplitBill } from '../../shared/home-split-bills';
type Summary = {count:number;bills:PendingSplitBill[]};
export function HomePendingSplitBills({ hidden }: { hidden: boolean }) {
  const session = useSession();
  const { colors, styles } = useTheme();
  const { demo, profileId, request } = session;
  const [loaded, setLoaded] = useState<{ profileId: string; summary: Summary } | null>(null);
  useFocusEffect(useCallback(() => {
    if (demo || !profileId) return;
    let active = true;
    const refresh = async () => {
      try {
        const path = `split-bills?homeSummary=true&workspaceId=${encodeURIComponent(profileId)}`;
        const { pending } = await request<{ pending: Summary }>(path);
        if (active) setLoaded({ profileId, summary: pending });
      } catch {
        // Optional card. The request records its failure independently of Home.
      }
      return true;
    };
    void refresh();
    const unregister = registerScreenRefresh('/', refresh);
    return () => { active = false; unregister(); };
  }, [request, demo, profileId]));
  const summary = !demo && loaded?.profileId === profileId ? loaded.summary : null;
  if (!summary?.count) return null;
  return <Card><Text style={styles.sectionTitle}>Pending Split Bills</Text><Body>{summary.count} {summary.count === 1 ? 'bill' : 'bills'} to settle</Body>
    {summary.bills.map(bill => <Pressable key={bill.id} accessibilityRole="button" onPress={() => router.navigate({pathname:'/split-bills',params:{billId:bill.id}})} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:52}}>
      <Icon name="people-outline" size={24}/><View style={{flex:1,minWidth:0}}><Text style={{color:colors.ink,fontSize:14}}>{bill.title}</Text><Text style={{color:colors.muted,fontSize:12}}>{hidden ? "••••" : money(String(bill.remaining),bill.currency)} left to settle</Text></View><Icon line name="chevron-forward" size={18}/>
    </Pressable>)}
  </Card>;
}
