import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import { Button, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Location from 'expo-location';

const WEBHOOK_URL = 'https://oscarrios.app.n8n.cloud/webhook/location';

export default function App() {
  const [permission, setPermission] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(0);
  const [lastPayload, setLastPayload] = useState(null);
  const [history, setHistory] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const watcher = useRef(null);

  useEffect(() => {
    const load = async () => {
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(Math.round((level < 0 ? 0 : level) * 100));
    };
    load();
    const sub = Battery.addBatteryLevelListener(({ batteryLevel: l }) => {
      setBatteryLevel(Math.round((l < 0 ? 0 : l) * 100));
    });
    return () => sub.remove();
  }, []);

  const sendToWebhook = async (location) => {
    const level = await Battery.getBatteryLevelAsync();
    const payload = {
      usuario: 'Oscar Adrian Regalado Rios',
      dispositivo: {
        nombre: Device.deviceName || Device.modelName || Platform.OS,
        version: Device.osVersion ? `${Platform.OS} ${Device.osVersion}` : Platform.OS,
      },
      ubicacion: {
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        altitud: location.coords.altitude,
        precision: location.coords.accuracy,
      },
      movimiento: {
        velocidad: location.coords.speed,
        marca_tiempo: new Date(location.timestamp).toISOString(),
      },
      estado: {
        bateria: level < 0 ? null : Math.round(level * 100) / 100,
      },
    };
    setLastPayload(payload);
    setHistory((prev) => [payload, ...prev].slice(0, 20));
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('POST a n8n ->', res.status);
    } catch (err) {
      console.log('Error al enviar ->', err.message);
    }
  };

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermission(status);
    if (status !== 'granted') {
      setErrorMsg('Permiso de ubicación denegado.');
      return;
    }
    watcher.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
      },
      sendToWebhook
    );
    setTracking(true);
    setErrorMsg('');
  };

  const stopTracking = async () => {
    if (watcher.current) await watcher.current.remove();
    watcher.current = null;
    setTracking(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>LOCATIONMIKE · Telemetría</Text>
      <Text style={styles.subtitle}>Envío automático cada 10 metros</Text>

      <View style={styles.row}>
        <Text style={styles.info}>Batería: {batteryLevel}%</Text>
        <Text style={styles.info}>Permiso: {permission ?? 'sin solicitar'}</Text>
      </View>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <Button
        title={tracking ? 'Detener rastreo' : 'Iniciar rastreo'}
        onPress={tracking ? stopTracking : startTracking}
      />

      <Text style={styles.label}>Último payload enviado</Text>
      {lastPayload ? (
        <ScrollView style={styles.jsonBox}>
          <Text style={styles.json}>{JSON.stringify(lastPayload, null, 2)}</Text>
        </ScrollView>
      ) : (
        <Text style={styles.hint}>Presiona "Iniciar rastreo" y muévete al menos 10 metros.</Text>
      )}

      <Text style={styles.label}>Historial ({history.length})</Text>
      <ScrollView style={styles.history}>
        {history.map((p, i) => (
          <Text key={i} style={styles.historyItem}>
            {i + 1}. {p.movimiento.marca_tiempo} · lat {p.ubicacion.lat.toFixed(5)} · lon{' '}
            {p.ubicacion.lon.toFixed(5)} · {Math.round((p.estado.bateria ?? 0) * 100)}%
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 70,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  info: {
    fontSize: 14,
  },
  error: {
    color: '#b00020',
    marginBottom: 8,
  },
  label: {
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 6,
  },
  jsonBox: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
  },
  json: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 12,
  },
  hint: {
    color: '#888',
    fontStyle: 'italic',
  },
  history: {
    flex: 1,
    marginTop: 4,
  },
  historyItem: {
    fontSize: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
