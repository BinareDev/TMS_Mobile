import { View, Text } from 'react-native';

export default function UserItem({ name, role }: any) {
  return (
    <View
      style={{
        padding: 15,
        marginBottom: 10,
        backgroundColor: '#f2f2f2',
        borderRadius: 6,
      }}
    >
      <Text style={{ fontSize: 16 }}>{name}</Text>
      <Text style={{ color: 'gray' }}>{role}</Text>
    </View>
  );
}
