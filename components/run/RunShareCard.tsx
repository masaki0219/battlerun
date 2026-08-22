import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import {
  BorderRadius, Colors, DarkColors, RoutePaceColors, Typography,
} from '../../design_tokens';
import type { RouteVisualization, RoutePaceBand } from '../../utils/routeSplits';
import { useTranslation } from '../../lib/i18n';
import { formatRunDistanceKm } from '../../utils/displayStats';
import type { RunShareStyle } from '../../utils/runSharePreference';

const ROUTE_PACE_COLOR: Record<RoutePaceBand, string> = {
  fast: RoutePaceColors.fast,
  steady: RoutePaceColors.steady,
  slow: RoutePaceColors.slow,
};

export interface RunShareMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface RunShareCardProps {
  distanceKm: number;
  durationLabel: string;
  paceLabel?: string | null;
  dateLabel?: string | null;
  impactLabel?: string | null;
  mapRegion?: RunShareMapRegion | null;
  routeVisualization?: RouteVisualization | null;
  shareStyle: RunShareStyle;
  showWatermark: boolean;
}

export const RunShareCard = forwardRef<View, RunShareCardProps>(function RunShareCard({
  distanceKm,
  durationLabel,
  paceLabel,
  dateLabel,
  impactLabel,
  mapRegion,
  routeVisualization,
  shareStyle,
  showWatermark,
}, ref) {
  const { t } = useTranslation();
  const showRoute = shareStyle !== 'stats' && !!mapRegion && !!routeVisualization;
  const showRunDetails = shareStyle !== 'stats';
  const safeDistance = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return (
    <View
      ref={ref}
      collapsable={false}
      style={s.card}
      accessibilityLabel={t('summary.previewA11y', { distance: formatRunDistanceKm(safeDistance), duration: durationLabel })}
    >
      {showRoute ? (
        <View style={s.routeHero}>
          <MapView
            style={s.map}
            provider={PROVIDER_DEFAULT}
            mapType={shareStyle === 'route' ? 'none' : 'standard'}
            initialRegion={mapRegion}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {routeVisualization.segments.map((segment) => (
              <Polyline
                key={`share-${segment.id}`}
                coordinates={segment.coordinates}
                strokeColor={ROUTE_PACE_COLOR[segment.band]}
                strokeWidth={4}
              />
            ))}
            {routeVisualization.kmMarkers.map((marker) => (
              <Marker
                key={`share-km-${marker.km}`}
                coordinate={marker}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={s.kmMarker}>
                  <Text allowFontScaling={false} style={s.kmMarkerText}>{marker.km}</Text>
                </View>
              </Marker>
            ))}
          </MapView>
        </View>
      ) : (
        <View style={s.noMapHero}>
          <View style={s.noMapRingOuter} />
          <View style={s.noMapRingInner} />
          <Text allowFontScaling={false} style={s.noMapLabel}>{t('locale.runTogether')}</Text>
        </View>
      )}

      <View style={s.content}>
        <View style={s.brandRow}>
          <View style={s.brandMark}>
            <Text allowFontScaling={false} style={s.brandMarkText}>Z</Text>
          </View>
          <Text allowFontScaling={false} style={s.brand}>ZELIO</Text>
          <View style={s.brandDivider} />
          <Text allowFontScaling={false} style={s.resultLabel}>{t('locale.runResult')}</Text>
          {!!dateLabel && <Text allowFontScaling={false} style={s.dateLabel}>{dateLabel}</Text>}
        </View>

        <View style={s.distanceRow}>
          <Text allowFontScaling={false} style={s.distance}>{formatRunDistanceKm(safeDistance)}</Text>
          <Text allowFontScaling={false} style={s.distanceUnit}>KM</Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.statCell}>
            <Text allowFontScaling={false} style={s.statLabel}>{t('locale.time')}</Text>
            <Text allowFontScaling={false} style={s.statValue}>{durationLabel}</Text>
          </View>
          {showRunDetails && !!paceLabel && (
            <>
              <View style={s.statDivider} />
              <View style={s.statCell}>
                <Text allowFontScaling={false} style={s.statLabel}>{t('locale.avgPace')}</Text>
                <Text allowFontScaling={false} style={s.statValue}>{paceLabel}<Text style={s.statUnit}>/km</Text></Text>
              </View>
            </>
          )}
        </View>

        {showRunDetails && !!impactLabel && (
          <View style={s.impactPill}>
            <Text allowFontScaling={false} numberOfLines={2} style={s.impactText}>{impactLabel}</Text>
          </View>
        )}

        <View style={s.footer}>
          <View>
            <Text allowFontScaling={false} style={s.tag}>#ZELIO</Text>
            <Text allowFontScaling={false} style={s.tagline}>{t('summary.shareTagline')}</Text>
          </View>
        </View>
      </View>

      {showWatermark && (
        <View style={s.watermark}>
          <Text allowFontScaling={false} style={s.watermarkText}>{t('locale.madeWith')}</Text>
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: BorderRadius.lg,
    backgroundColor: DarkColors.background,
    overflow: 'hidden',
    position: 'relative',
  },
  routeHero: { height: 184, width: '100%', backgroundColor: DarkColors.surfaceDeep },
  map: { ...StyleSheet.absoluteFillObject },
  noMapHero: {
    height: 116,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
    backgroundColor: DarkColors.surfaceDeep,
    borderBottomWidth: 1,
    borderBottomColor: DarkColors.lineStrong,
  },
  noMapRingOuter: {
    position: 'absolute', width: 190, height: 190, borderRadius: BorderRadius.full,
    borderWidth: 24, borderColor: DarkColors.decor, right: -34, top: -82,
  },
  noMapRingInner: {
    position: 'absolute', width: 124, height: 124, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: DarkColors.decorLine, right: 0, top: -48,
  },
  noMapLabel: {
    fontFamily: Typography.fontFamily.mono, fontSize: 10, fontWeight: '700',
    letterSpacing: 2, color: DarkColors.primary,
  },
  content: { padding: 18, gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  brandMark: {
    width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DarkColors.primary,
  },
  brandMarkText: { fontSize: 13, fontWeight: '900', color: DarkColors.background },
  brand: { marginLeft: 7, fontSize: 13, fontWeight: '900', letterSpacing: 1.4, color: DarkColors.textPrimary },
  brandDivider: { width: 1, height: 13, marginHorizontal: 8, backgroundColor: DarkColors.lineStrong },
  resultLabel: { fontFamily: Typography.fontFamily.mono, fontSize: 8, fontWeight: '700', letterSpacing: 1.2, color: DarkColors.textTertiary },
  dateLabel: { marginLeft: 'auto', fontSize: 10, fontWeight: '700', color: DarkColors.textSecondary },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  distance: { fontSize: 54, lineHeight: 58, fontWeight: '900', letterSpacing: -2, color: DarkColors.textPrimary, fontVariant: ['tabular-nums'] },
  distanceUnit: { fontSize: 17, fontWeight: '800', letterSpacing: 1, color: DarkColors.textTertiary },
  statsRow: {
    flexDirection: 'row', paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: BorderRadius.md, backgroundColor: DarkColors.line,
  },
  statCell: { flex: 1, gap: 3 },
  statDivider: { width: 1, marginHorizontal: 12, backgroundColor: DarkColors.lineStrong },
  statLabel: { fontFamily: Typography.fontFamily.mono, fontSize: 8, fontWeight: '700', letterSpacing: 1, color: DarkColors.textTertiary },
  statValue: { fontSize: 15, fontWeight: '800', color: DarkColors.textPrimary, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 9, color: DarkColors.textTertiary },
  impactPill: {
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: BorderRadius.md, backgroundColor: DarkColors.primarySoft,
    borderWidth: 1, borderColor: DarkColors.primaryRing,
  },
  impactText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: DarkColors.primaryTint },
  footer: { paddingTop: 2 },
  tag: { fontSize: 12, fontWeight: '900', color: DarkColors.primary },
  tagline: { marginTop: 2, fontSize: 9, fontWeight: '700', color: DarkColors.textSecondary },
  kmMarker: {
    minWidth: 22, height: 22, paddingHorizontal: 3, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: DarkColors.background, borderWidth: 2, borderColor: DarkColors.primary,
  },
  kmMarkerText: { fontSize: 9, fontWeight: '900', color: DarkColors.textPrimary },
  watermark: {
    position: 'absolute', right: 10, top: 10,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: BorderRadius.sm, backgroundColor: DarkColors.surfaceDeep,
    borderWidth: 1, borderColor: DarkColors.lineStrong,
  },
  watermarkText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.7, color: DarkColors.textSecondary },
});
