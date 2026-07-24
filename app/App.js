import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import sampleDigest from "./digest-sample.json";

// After you push this project to GitHub, replace this with the raw URL of
// your own digest.json, e.g.:
// https://raw.githubusercontent.com/<you>/<repo>/main/digest.json
const DIGEST_URL =
  "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/digest.json";

const CATEGORY_COLORS = {
  UX: "#3B6E71",
  Research: "#7A5C8E",
  "Product design": "#B0663F",
  "Design & dev": "#4F6D8C",
};

function CategoryPill({ category }) {
  const color = CATEGORY_COLORS[category] ?? "#5F5E5A";
  return (
    <View style={[styles.pill, { backgroundColor: color + "1A" }]}>
      <Text style={[styles.pillText, { color }]}>{category}</Text>
    </View>
  );
}

function DigestCard({ item }) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => Linking.openURL(item.link)}
    >
      <CategoryPill category={item.category} />
      <Text style={styles.headline}>{item.headline}</Text>
      <Text style={styles.summary}>{item.summary}</Text>
      <Text style={styles.source}>{item.source}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(DIGEST_URL + "?t=" + Date.now());
      if (!res.ok) throw new Error("Could not load today's digest");
      const data = await res.json();
      setItems(data.items ?? []);
      setGeneratedAt(data.generatedAt ?? null);
    } catch (e) {
      // Fall back to the bundled sample so the app is never empty on first run
      setItems(sampleDigest.items ?? []);
      setGeneratedAt(sampleDigest.generatedAt ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const dateLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Today in UX</Text>
        {dateLabel ? <Text style={styles.date}>{dateLabel}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#3B6E71" size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            Nothing new today — check back tomorrow.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.link}
          renderItem={({ item }) => <DigestCard item={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FAFAF7",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1C1E1B",
  },
  date: {
    fontSize: 14,
    color: "#7A7A73",
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#ECEAE2",
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  headline: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1C1E1B",
    marginBottom: 6,
    lineHeight: 22,
  },
  summary: {
    fontSize: 15,
    color: "#4A4A44",
    lineHeight: 21,
    marginBottom: 10,
  },
  source: {
    fontSize: 12,
    color: "#9B9A92",
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 15,
    color: "#B0663F",
    textAlign: "center",
    marginBottom: 6,
  },
  errorHint: {
    fontSize: 13,
    color: "#9B9A92",
  },
  emptyText: {
    fontSize: 15,
    color: "#7A7A73",
    textAlign: "center",
  },
});
