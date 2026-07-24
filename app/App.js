import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import sampleDigest from "./digest-sample.json";

// After you push this project to GitHub, replace this with the raw URL of
// your own digest.json, e.g.:
// https://raw.githubusercontent.com/<you>/<repo>/main/digest.json
const DIGEST_URL =
  "https://raw.githubusercontent.com/rheaguptaux/ux-digest-app/main/digest.json";

const SAVED_KEY = "ux_digest_saved_v2";
const FAVORITES_KEY = "ux_digest_favorites_v2";

const BG = "#0D0D10";
const SURFACE = "#18181C";
const SURFACE_RAISED = "#1F1F25";
const BORDER = "#28282E";
const TEXT_PRIMARY = "#F5F5F2";
const TEXT_SECONDARY = "#9C9CA6";
const TEXT_MUTED = "#6B6B74";
const ACCENT = "#FF5C38";
const RESEARCH_COLOR = "#60A5FA";
const OPINION_COLOR = "#A78BFA";

const TAG_COLORS = ["#FF5C38", "#2DD4BF", "#A78BFA", "#FBBF24", "#60A5FA"];
function colorForTag(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

async function loadList(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
async function persistList(key, list) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore write failures
  }
}

function useLibrary() {
  const [saved, setSaved] = useState([]);
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, f] = await Promise.all([loadList(SAVED_KEY), loadList(FAVORITES_KEY)]);
      setSaved(s);
      setFavorites(f);
    })();
  }, []);

  const toggleSaved = useCallback((item) => {
    setSaved((prev) => {
      const exists = prev.some((it) => it.link === item.link);
      const next = exists ? prev.filter((it) => it.link !== item.link) : [item, ...prev];
      persistList(SAVED_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((item) => {
    setFavorites((prev) => {
      const exists = prev.some((it) => it.link === item.link);
      const next = exists ? prev.filter((it) => it.link !== item.link) : [item, ...prev];
      persistList(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const isSaved = useCallback((link) => saved.some((it) => it.link === link), [saved]);
  const isFavorite = useCallback((link) => favorites.some((it) => it.link === link), [favorites]);

  return { saved, favorites, toggleSaved, toggleFavorite, isSaved, isFavorite };
}

async function shareItem(item) {
  try {
    await Share.share({ message: `${item.headline}\n${item.link}` });
  } catch {
    // cancelled — no action needed
  }
}

function TagChip({ tag }) {
  const color = colorForTag(tag);
  return (
    <View style={[styles.chip, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <Text style={[styles.chipText, { color }]}>{tag}</Text>
    </View>
  );
}

function IconButton({ name, color, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} style={styles.iconButton}>
      <Ionicons name={name} size={19} color={color} />
    </TouchableOpacity>
  );
}

function CardImage({ uri, type, height }) {
  const tint = type === "opinion" ? OPINION_COLOR : RESEARCH_COLOR;
  if (uri) {
    return <Image source={{ uri }} style={[styles.cardImage, { height }]} resizeMode="cover" />;
  }
  return (
    <View style={[styles.cardImage, styles.cardImagePlaceholder, { height, backgroundColor: tint + "22" }]}>
      <Ionicons name="image-outline" size={28} color={tint} />
    </View>
  );
}

// Compact feed card: image + a small eyebrow label + title only. No summary text —
// tap through to the detail screen for the full write-up.
function DigestCard({ item, onPress, featured, isSaved, isFavorited, onToggleSave, onToggleFavorite }) {
  const eyebrowColor = item.type === "opinion" ? OPINION_COLOR : RESEARCH_COLOR;
  const eyebrowLabel = item.type === "opinion" ? "Opinion" : item.category ?? "Research";

  return (
    <TouchableOpacity
      style={[styles.card, featured && styles.cardFeatured]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View>
        <CardImage uri={item.image} type={item.type} height={featured ? 190 : 150} />
        {featured ? (
          <View style={styles.pickBadge}>
            <Text style={styles.pickBadgeText}>Top pick</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBody}>
        <Text style={[styles.eyebrow, { color: eyebrowColor }]}>{eyebrowLabel.toUpperCase()}</Text>
        <Text style={featured ? styles.headlineFeatured : styles.headline}>{item.headline}</Text>

        <View style={styles.footer}>
          <Text style={styles.source} numberOfLines={1}>
            {item.source}
          </Text>
          <View style={styles.iconRow}>
            <IconButton
              name={isFavorited ? "heart" : "heart-outline"}
              color={isFavorited ? ACCENT : TEXT_MUTED}
              onPress={() => onToggleFavorite(item)}
            />
            <IconButton
              name={isSaved ? "bookmark" : "bookmark-outline"}
              color={isSaved ? ACCENT : TEXT_MUTED}
              onPress={() => onToggleSave(item)}
            />
            <IconButton name="share-outline" color={TEXT_MUTED} onPress={() => shareItem(item)} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function DetailScreen({ item, onBack, isSaved, isFavorited, onToggleSave, onToggleFavorite }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.iconRow}>
          <IconButton
            name={isFavorited ? "heart" : "heart-outline"}
            color={isFavorited ? ACCENT : TEXT_MUTED}
            onPress={onToggleFavorite}
          />
          <IconButton
            name={isSaved ? "bookmark" : "bookmark-outline"}
            color={isSaved ? ACCENT : TEXT_MUTED}
            onPress={onToggleSave}
          />
          <IconButton name="share-outline" color={TEXT_MUTED} onPress={() => shareItem(item)} />
        </View>
      </View>
      <ScrollView>
        <CardImage uri={item.image} type={item.type} height={220} />
        <View style={styles.detailBody}>
          <View style={styles.chipRow}>
            {(item.tags ?? []).map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </View>
          <Text style={styles.detailHeadline}>{item.headline}</Text>

          {item.background ? (
            <>
              <Text style={styles.sectionLabel}>Background</Text>
              <Text style={styles.bodyText}>{item.background}</Text>
            </>
          ) : null}

          {item.keyFindings?.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Key findings</Text>
              {item.keyFindings.map((f, idx) => (
                <View key={idx} style={styles.findingRow}>
                  <View style={styles.findingDot} />
                  <Text style={styles.bodyText}>{f}</Text>
                </View>
              ))}
            </>
          ) : null}

          {item.implications ? (
            <>
              <Text style={styles.sectionLabel}>What to note</Text>
              <View style={styles.whyBox}>
                <View style={styles.whyBar} />
                <Text style={styles.whyText}>{item.implications}</Text>
              </View>
            </>
          ) : null}

          <Text style={styles.detailSource}>Source: {item.source}</Text>

          <TouchableOpacity style={styles.readFullButton} onPress={() => Linking.openURL(item.link)}>
            <Text style={styles.readFullButtonText}>Read full article →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, data, onSelect, isSaved, isFavorite, onToggleSave, onToggleFavorite, featured }) {
  if (!data || data.length === 0) return null;
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionHeader}>{label}</Text>
      {data.map((item) => (
        <DigestCard
          key={item.link}
          item={item}
          onPress={() => onSelect(item)}
          featured={featured}
          isSaved={isSaved(item.link)}
          isFavorited={isFavorite(item.link)}
          onToggleSave={onToggleSave}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </View>
  );
}

function TodayScreen({ items, loading, refreshing, onRefresh, dateLabel, onSelect, isSaved, isFavorite, onToggleSave, onToggleFavorite }) {
  const featured = items.filter((i) => i.featured);
  const nonFeatured = items.filter((i) => !i.featured);
  const researchToday = nonFeatured.filter((i) => i.type === "research" && i.publishedWindow === "today");
  const researchWeek = nonFeatured.filter((i) => i.type === "research" && i.publishedWindow === "week");
  const opinions = nonFeatured.filter((i) => i.type === "opinion");

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Today in <Text style={{ color: ACCENT }}>UX</Text>
        </Text>
        {items.length > 0 ? <Text style={styles.meta}>{dateLabel} · {items.length} stories</Text> : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Nothing new today — check back tomorrow.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          <Section label="Top picks" data={featured} featured onSelect={onSelect} isSaved={isSaved} isFavorite={isFavorite} onToggleSave={onToggleSave} onToggleFavorite={onToggleFavorite} />
          <Section label="Trending today" data={researchToday} onSelect={onSelect} isSaved={isSaved} isFavorite={isFavorite} onToggleSave={onToggleSave} onToggleFavorite={onToggleFavorite} />
          <Section label="This week" data={researchWeek} onSelect={onSelect} isSaved={isSaved} isFavorite={isFavorite} onToggleSave={onToggleSave} onToggleFavorite={onToggleFavorite} />
          <Section label="Opinions" data={opinions} onSelect={onSelect} isSaved={isSaved} isFavorite={isFavorite} onToggleSave={onToggleSave} onToggleFavorite={onToggleFavorite} />
        </ScrollView>
      )}
    </View>
  );
}

function SavedScreen({ saved, favorites, onSelect, isSaved, isFavorite, onToggleSave, onToggleFavorite }) {
  const isEmpty = saved.length === 0 && favorites.length === 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved</Text>
        <Text style={styles.meta}>Kept even after the daily digest updates</Text>
      </View>

      {isEmpty ? (
        <View style={styles.centered}>
          <Ionicons name="bookmark-outline" size={32} color={TEXT_MUTED} style={{ marginBottom: 10 }} />
          <Text style={styles.emptyText}>Nothing saved yet. Tap the heart or bookmark icon on any story.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Section label="Favorites" data={favorites} onSelect={onSelect} isSaved={isSaved} isFavorite={isFavorite} onToggleSave={onToggleSave} onToggleFavorite={onToggleFavorite} />
          <Section label="Saved for later" data={saved} onSelect={onSelect} isSaved={isSaved} isFavorite={isFavorite} onToggleSave={onToggleSave} onToggleFavorite={onToggleFavorite} />
        </ScrollView>
      )}
    </View>
  );
}

function TabBar({ active, onChange }) {
  return (
    <View style={styles.tabBar}>
      <TouchableOpacity style={styles.tabItem} onPress={() => onChange("today")}>
        <Ionicons name={active === "today" ? "today" : "today-outline"} size={22} color={active === "today" ? ACCENT : TEXT_MUTED} />
        <Text style={[styles.tabLabel, active === "today" && { color: ACCENT }]}>Today</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => onChange("saved")}>
        <Ionicons name={active === "saved" ? "bookmark" : "bookmark-outline"} size={22} color={active === "saved" ? ACCENT : TEXT_MUTED} />
        <Text style={[styles.tabLabel, active === "saved" && { color: ACCENT }]}>Saved</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("today");

  const { saved, favorites, toggleSaved, toggleFavorite, isSaved, isFavorite } = useLibrary();

  const load = useCallback(async () => {
    try {
      const res = await fetch(DIGEST_URL + "?t=" + Date.now());
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setItems(data.items ?? []);
      setGeneratedAt(data.generatedAt ?? null);
    } catch (e) {
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
    ? new Date(generatedAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "";

  if (selected) {
    return (
      <DetailScreen
        item={selected}
        onBack={() => setSelected(null)}
        isSaved={isSaved(selected.link)}
        isFavorited={isFavorite(selected.link)}
        onToggleSave={() => toggleSaved(selected)}
        onToggleFavorite={() => toggleFavorite(selected)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      {activeTab === "today" ? (
        <TodayScreen
          items={items}
          loading={loading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          dateLabel={dateLabel}
          onSelect={setSelected}
          isSaved={isSaved}
          isFavorite={isFavorite}
          onToggleSave={toggleSaved}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <SavedScreen
          saved={saved}
          favorites={favorites}
          onSelect={setSelected}
          isSaved={isSaved}
          isFavorite={isFavorite}
          onToggleSave={toggleSaved}
          onToggleFavorite={toggleFavorite}
        />
      )}
      <TabBar active={activeTab} onChange={setActiveTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 34, fontWeight: "900", color: TEXT_PRIMARY, letterSpacing: -1 },
  meta: { fontSize: 13, color: TEXT_MUTED, marginTop: 6, fontWeight: "600" },
  list: { paddingHorizontal: 18, paddingBottom: 40 },
  sectionBlock: { marginBottom: 8 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "800",
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  cardFeatured: { backgroundColor: SURFACE_RAISED, borderColor: ACCENT + "55" },
  cardImage: { width: "100%" },
  cardImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  pickBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: ACCENT,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pickBadgeText: { fontSize: 11, fontWeight: "800", color: "#1A0A05", textTransform: "uppercase", letterSpacing: 0.5 },
  cardBody: { padding: 16 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },
  headline: { fontSize: 18, fontWeight: "800", color: TEXT_PRIMARY, lineHeight: 24, letterSpacing: -0.3 },
  headlineFeatured: { fontSize: 21, fontWeight: "900", color: TEXT_PRIMARY, lineHeight: 27, letterSpacing: -0.4 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  source: { flex: 1, fontSize: 12, color: TEXT_MUTED, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, marginRight: 8 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconButton: { padding: 6 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyText: { fontSize: 15, color: TEXT_SECONDARY, textAlign: "center", lineHeight: 21 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backText: { fontSize: 16, fontWeight: "700", color: ACCENT },
  detailBody: { padding: 24, paddingBottom: 60 },
  detailHeadline: { fontSize: 27, fontWeight: "900", color: TEXT_PRIMARY, lineHeight: 33, marginBottom: 18, letterSpacing: -0.5 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
  },
  bodyText: { fontSize: 15, color: TEXT_SECONDARY, lineHeight: 22 },
  findingRow: { flexDirection: "row", marginBottom: 8, paddingRight: 4 },
  findingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: TEXT_MUTED, marginTop: 8, marginRight: 10 },
  whyBox: { flexDirection: "row", marginTop: 2 },
  whyBar: { width: 3, borderRadius: 2, backgroundColor: ACCENT, marginRight: 10 },
  whyText: { flex: 1, fontSize: 15, color: TEXT_PRIMARY, fontWeight: "600", lineHeight: 21 },
  detailSource: { fontSize: 13, color: TEXT_MUTED, fontWeight: "700", marginTop: 24 },
  readFullButton: { marginTop: 16, backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  readFullButtonText: { fontSize: 15, fontWeight: "800", color: "#1A0A05" },
  tabBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: BG, paddingTop: 8, paddingBottom: 4 },
  tabItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 },
  tabLabel: { fontSize: 11, fontWeight: "700", color: TEXT_MUTED },
});
