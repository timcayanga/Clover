import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet } from 'react-native';
import { Text } from './app-text';
import { greetingName } from '../../shared/home-return';
/** Presentation only: mounts after verified bootstrap; never delays requests/routes. */
export function ReturnGreeting({ firstName }: { firstName: string | null }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let backgroundAt: number | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      clearTimeout(timer);
      setVisible(true);
      timer = setTimeout(() => setVisible(false), 1000);
    };
    show();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundAt = Date.now();
        clearTimeout(timer);
        setVisible(false);
      }
      if (state === 'active' && backgroundAt !== null) {
        if (Date.now() - backgroundAt >= 30000) show();
        backgroundAt = null;
      }
    });
    return () => { clearTimeout(timer); listener.remove(); };
  }, []);
  if (!visible) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${greetingName(firstName)} Continue to Clover`} onPress={() => setVisible(false)} style={[StyleSheet.absoluteFill, {zIndex:300,backgroundColor:'#00AABD',alignItems:'center',justifyContent:'center',padding:24}]}>
    <Text style={{fontFamily:'Poppins-SemiBold',fontSize:36,color:'#fff',textAlign:'center'}}>{greetingName(firstName)}</Text>
  </Pressable>;
}
