import { View, Text } from 'react-native';

export default function Card({ title, value }: any) {
  return (
    <View
      style={{
        padding: 15,
        marginBottom: 10,
        backgroundColor: '#e0e0e0',
        borderRadius: 8,
      }}
    >
      <Text>{title}</Text>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>
        {value}
      </Text>
    </View>
  );
}
