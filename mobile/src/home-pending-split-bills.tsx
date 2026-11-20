import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './app-text';
import { useSession } from './session';
import { registerScreenRefresh } from './screen-refresh';
import { MerchantLogo } from './merchant-logo';
import { PersonAvatar } from './person-avatar';
import { useUser } from '@clerk/expo';
import { Card, Icon, money, useTheme } from './ui';
import { ApiError } from './api';
import { splitBillReadRequiresAction } from '../../shared/split-bill-read';
import type { PendingSplitBill, PendingSplitBillAvatar } from '../../shared/home-split-bills';
type Summary = {count:number;bills:PendingSplitBill[]};
export function HomePendingSplitBills({ hidden }: { hidden: boolean }) {
  const session = useSession();
  const { colors, styles } = useTheme();
  const { demo, profileId, request } = session;
  const [loaded, setLoaded] = useState<{ profileId: string; summary: Summary } | null>(null);
  const blockedProfile = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (demo || !profileId) return;
    let active = true;
    if (blockedProfile.current !== profileId) blockedProfile.current = null;
    const refresh = async () => {
      try {
        const path = `split-bills?homeSummary=true&workspaceId=${encodeURIComponent(profileId)}`;
        const { pending } = await request<{ pending: Summary }>(path);
        if (active) {
          blockedProfile.current = null;
          setLoaded({ profileId, summary: pending });
        }
      } catch (error) {
        if (active && error instanceof ApiError && splitBillReadRequiresAction(error.status)) {
          blockedProfile.current = profileId;
          setLoaded(null);
        }
      }
      return true;
    };
    if (!blockedProfile.current) void refresh();
    const unregister = registerScreenRefresh('/', refresh);
    return () => { active = false; unregister(); };
  }, [request, demo, profileId]));
  const summary = !demo && loaded?.profileId === profileId ? loaded.summary : null;
  if (!summary?.count) return null;
  return <Card><Text style={styles.sectionTitle}>Pending Split Bills</Text>
    {summary.bills.map(bill => <Pressable key={bill.id} accessibilityRole="button" onPress={() => router.navigate({pathname:'/split-bills',params:{billId:bill.id}})} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:52}}>
      <MerchantLogo transaction={bill.mark ?? {merchantRaw:bill.title, merchantClean:null, categoryName:null}} /><View style={{flex:1,minWidth:0}}><Text style={{color:colors.ink,fontSize:14}}>{bill.title}</Text><Text style={{color:colors.muted,fontSize:12}}>{hidden ? "••••" : money(String(bill.remaining),bill.currency)} left to settle</Text></View><PendingBillAvatars avatars={bill.avatars} /><Icon line name="chevron-forward" size={18}/>
    </Pressable>)}
  </Card>;
}

function PendingBillAvatars({ avatars }: { avatars?: PendingSplitBillAvatar[] }) {
  const { user } = useUser();
  if (!avatars?.length) return null;
  const people = avatars;
  return <View accessibilityLabel={people.map(person => person.name).join(', ')} style={{flexDirection:'row',flexShrink:0}}>
    {people.map((person,index) => <View key={index} style={{marginLeft:index ? -8 : 0,borderWidth:2,borderColor:'white',borderRadius:16}}>
      <PersonAvatar name={person.name} imageUrl={person.isSelf ? user?.imageUrl ?? person.avatarUrl : person.avatarUrl} size={26}/>
    </View>)}
  </View>;
}
