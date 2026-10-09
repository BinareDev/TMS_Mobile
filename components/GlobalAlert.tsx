import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const globalAlertRef = React.createRef<any>();

export const showCustomAlert = (title: string, message: string, onConfirm?: () => void) => {
  if (globalAlertRef.current) {
    globalAlertRef.current.showAlert(title, message, onConfirm);
  } else {
    // Fallback if not mounted
    console.warn('GlobalAlert not mounted!', title, message);
  }
};

export const GlobalAlert = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [onConfirm, setOnConfirm] = useState<(() => void) | undefined>();

  useImperativeHandle(ref, () => ({
    showAlert: (t: string, m: string, onOk?: () => void) => {
      setTitle(t);
      setMessage(m);
      setOnConfirm(() => onOk);
      setVisible(true);
    }
  }));

  const handleClose = () => {
    setVisible(false);
    if (onConfirm) {
      onConfirm();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
           <Text style={styles.title}>{title}</Text>
           <Text style={styles.message}>{message}</Text>
           <TouchableOpacity onPress={handleClose} style={styles.button}>
             <Text style={styles.buttonText}>OK</Text>
           </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { 
    flex: 1, 
    backgroundColor: 'rgba(11, 15, 25, 0.85)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  card: { 
    backgroundColor: '#1e293b', 
    padding: 24, 
    borderRadius: 16, 
    width: '85%', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10
  },
  title: { 
    color: '#f8fafc', 
    fontSize: 20, 
    fontWeight: '700', 
    marginBottom: 12,
    textAlign: 'center'
  },
  message: { 
    color: '#94a3b8', 
    fontSize: 16, 
    textAlign: 'center', 
    marginBottom: 24,
    lineHeight: 24
  },
  button: { 
    backgroundColor: '#6366f1', 
    paddingHorizontal: 32, 
    paddingVertical: 14, 
    borderRadius: 12,
    width: '100%',
    alignItems: 'center'
  },
  buttonText: { 
    color: 'white', 
    fontWeight: '700',
    fontSize: 16
  }
});
