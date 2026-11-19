import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./app-text";
import { Field } from "./ui";
export function TogetherToolbar({
  search,
  onSearch,
  placeholder = "Search bills",
  action = "Add Bill",
  onAdd,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  action?: string;
  onAdd?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Field
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          value={search}
          onChangeText={onSearch}
          style={{
            height: 44,
            minHeight: 44,
            borderRadius: 22,
            paddingVertical: 0,
          }}
        />
      </View>
      {onAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAdd}
        >
          <LinearGradient
            colors={["#00a9bd", "#54d1cc"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              height: 44,
              minWidth: 88,
              borderRadius: 22,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: "#fff",
                fontFamily: "Poppins-SemiBold",
                fontSize: 13,
              }}
            >
              {action}
            </Text>
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}
