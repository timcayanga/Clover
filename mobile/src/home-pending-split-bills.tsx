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
  const [summary, setSummary] = useState<Summary | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true, generation = 0;
    const refresh = async () => {
      if (session.demo) return true;
      const run = ++generation;
      try {
        const data = await session.request<{pending:Summary}>('split-bills?homeSummary=true');
        if (!active || run !== generation) return false;
        setSummary(data.pending); return true;
      } catch { return false; }
    };
    void refresh();
    const unregister = registerScreenRefresh('/', refresh);
    return () => {active=false;unregister();};
  }, [session.request, session.demo]));
  if (!summary?.count) return null;
  return <Card><Text style={styles.sectionTitle}>Pending Split Bills</Text><Body>{summary.count} {summary.count === 1 ? 'bill' : 'bills'} to settle</Body>
    {summary.bills.map(bill => <Pressable key={bill.id} accessibilityRole="button" onPress={() => router.navigate({pathname:'/split-bills',params:{billId:bill.id}})} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:52}}>
      <Icon name="people-outline" size={24}/><View style={{flex:1,minWidth:0}}><Text style={{color:colors.ink,fontSize:14}}>{bill.title}</Text><Text style={{color:colors.muted,fontSize:12}}>{hidden ? "••••" : money(String(bill.remaining),bill.currency)} left to settle</Text></View><Icon line name="chevron-forward" size={18}/>
    </Pressable>)}
  </Card>;
}
