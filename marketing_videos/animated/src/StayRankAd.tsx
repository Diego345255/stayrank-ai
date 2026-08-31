import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, staticFile } from "remotion";
import { theme } from "./theme";
import { PhoneFrame } from "./components/PhoneFrame";
import { HookCard } from "./components/HookCard";
import { CTACard } from "./components/CTACard";
import { SearchScreen } from "./components/SearchScreen";
import { ReviewThemesScreen } from "./components/ReviewThemesScreen";
import { PriceWatchScreen } from "./components/PriceWatchScreen";
import { NeighborhoodScreen } from "./components/NeighborhoodScreen";
import { TopMatchScreen } from "./components/TopMatchScreen";
import { TripPlanScreen } from "./components/TripPlanScreen";
import { LanguageScreen } from "./components/LanguageScreen";
import { DarkModeScreen } from "./components/DarkModeScreen";
import { CompareScreen } from "./components/CompareScreen";
import { AskHotelScreen } from "./components/AskHotelScreen";
import { GuestFavoriteScreen } from "./components/GuestFavoriteScreen";
import { LandmarkScreen } from "./components/LandmarkScreen";
import { CancellationScreen } from "./components/CancellationScreen";
import { PackingScreen } from "./components/PackingScreen";
import { SustainabilityScreen } from "./components/SustainabilityScreen";
import { AccessibleScreen } from "./components/AccessibleScreen";
import { PetFriendlyScreen } from "./components/PetFriendlyScreen";
import { ExportScreen } from "./components/ExportScreen";
import { NoiseContextScreen } from "./components/NoiseContextScreen";
import { RecentlyViewedScreen } from "./components/RecentlyViewedScreen";
import { CurrencyScreen } from "./components/CurrencyScreen";
import { BestTimeScreen } from "./components/BestTimeScreen";
import { TransitScreen } from "./components/TransitScreen";
import { DataSourceScreen } from "./components/DataSourceScreen";
import { ShareUrlScreen } from "./components/ShareUrlScreen";
import { PrintPlanScreen } from "./components/PrintPlanScreen";
import { RecentCitiesScreen } from "./components/RecentCitiesScreen";
import { RefineScreen } from "./components/RefineScreen";
import { PersonaScreen } from "./components/PersonaScreen";
import { VerifiedStarScreen } from "./components/VerifiedStarScreen";
import { AutoMustsScreen } from "./components/AutoMustsScreen";
import { BillingScreen } from "./components/BillingScreen";
import { Captions, CaptionCue } from "./components/Captions";

// Rotates each ad across 3 real Pixabay clips (hotel/beach/city aerials) so
// the batch doesn't show the identical background on every single video
// when watched back-to-back on a channel. startFrom is clip-specific since
// city-bg is a much shorter source (~152 frames) than the other two.
const BG_CLIPS: Record<string, { name: string; ctaStartFrom: number }> = {
  hotel: { name: "hotel-bg", ctaStartFrom: 90 },
  beach: { name: "beach-bg", ctaStartFrom: 90 },
  city: { name: "city-bg", ctaStartFrom: 30 },
};

const VARIANT_BG: Record<string, keyof typeof BG_CLIPS> = {
  search: "hotel",
  reviews: "hotel",
  pricewatch: "hotel",
  neighborhood: "hotel",
  topmatch: "hotel",
  guestfavorite: "hotel",
  verifiedstar: "hotel",
  automusts: "hotel",
  billing: "hotel",
  datasource: "hotel",
  refine: "hotel",
  recentcities: "hotel",
  compare: "beach",
  cancellation: "beach",
  sustainability: "beach",
  accessible: "beach",
  petfriendly: "beach",
  noise: "beach",
  currency: "beach",
  besttime: "beach",
  packing: "beach",
  shareurl: "beach",
  printplan: "beach",
  tripplan: "city",
  language: "city",
  darkmode: "city",
  askhotel: "city",
  landmark: "city",
  export: "city",
  recentlyviewed: "city",
  transit: "city",
  persona: "city",
};

export type AdVariant =
  | "search"
  | "reviews"
  | "pricewatch"
  | "neighborhood"
  | "topmatch"
  | "tripplan"
  | "language"
  | "darkmode"
  | "compare"
  | "askhotel"
  | "guestfavorite"
  | "landmark"
  | "cancellation"
  | "packing"
  | "sustainability"
  | "accessible"
  | "petfriendly"
  | "export"
  | "noise"
  | "recentlyviewed"
  | "currency"
  | "besttime"
  | "transit"
  | "datasource"
  | "shareurl"
  | "printplan"
  | "recentcities"
  | "refine"
  | "persona"
  | "verifiedstar"
  | "automusts"
  | "billing";

export interface AdConfig {
  variant: AdVariant;
  hook: string;
  tagline: string;
  audioFile?: string;
  captionCues?: CaptionCue[];
  // "landscape" is for a 1920x1080 canvas (standard YouTube video
  // placement/pre-roll) vs. the default 1080x1920 Shorts/TikTok/Reels
  // canvas - the phone mockup (fixed 620x1180 internally) needs to shrink
  // to fit under 1080px of height with room for the caption bar below it.
  layout?: "portrait" | "landscape";
}

const SCREEN_START = 40;
const CTA_START = 380;
const TOTAL = 480;

const FeatureScreen: React.FC<{ variant: AdVariant; startFrame: number }> = ({
  variant,
  startFrame,
}) => {
  if (variant === "search") return <SearchScreen startFrame={startFrame} />;
  if (variant === "reviews") return <ReviewThemesScreen startFrame={startFrame} />;
  if (variant === "neighborhood") return <NeighborhoodScreen startFrame={startFrame} />;
  if (variant === "topmatch") return <TopMatchScreen startFrame={startFrame} />;
  if (variant === "tripplan") return <TripPlanScreen startFrame={startFrame} />;
  if (variant === "language") return <LanguageScreen startFrame={startFrame} />;
  if (variant === "darkmode") return <DarkModeScreen startFrame={startFrame} />;
  if (variant === "compare") return <CompareScreen startFrame={startFrame} />;
  if (variant === "askhotel") return <AskHotelScreen startFrame={startFrame} />;
  if (variant === "guestfavorite") return <GuestFavoriteScreen startFrame={startFrame} />;
  if (variant === "landmark") return <LandmarkScreen startFrame={startFrame} />;
  if (variant === "cancellation") return <CancellationScreen startFrame={startFrame} />;
  if (variant === "packing") return <PackingScreen startFrame={startFrame} />;
  if (variant === "sustainability") return <SustainabilityScreen startFrame={startFrame} />;
  if (variant === "accessible") return <AccessibleScreen startFrame={startFrame} />;
  if (variant === "petfriendly") return <PetFriendlyScreen startFrame={startFrame} />;
  if (variant === "export") return <ExportScreen startFrame={startFrame} />;
  if (variant === "noise") return <NoiseContextScreen startFrame={startFrame} />;
  if (variant === "recentlyviewed") return <RecentlyViewedScreen startFrame={startFrame} />;
  if (variant === "currency") return <CurrencyScreen startFrame={startFrame} />;
  if (variant === "besttime") return <BestTimeScreen startFrame={startFrame} />;
  if (variant === "transit") return <TransitScreen startFrame={startFrame} />;
  if (variant === "datasource") return <DataSourceScreen startFrame={startFrame} />;
  if (variant === "shareurl") return <ShareUrlScreen startFrame={startFrame} />;
  if (variant === "printplan") return <PrintPlanScreen startFrame={startFrame} />;
  if (variant === "recentcities") return <RecentCitiesScreen startFrame={startFrame} />;
  if (variant === "refine") return <RefineScreen startFrame={startFrame} />;
  if (variant === "persona") return <PersonaScreen startFrame={startFrame} />;
  if (variant === "verifiedstar") return <VerifiedStarScreen startFrame={startFrame} />;
  if (variant === "automusts") return <AutoMustsScreen startFrame={startFrame} />;
  if (variant === "billing") return <BillingScreen startFrame={startFrame} />;
  return <PriceWatchScreen startFrame={startFrame} />;
};

export const StayRankAd: React.FC<AdConfig> = ({
  variant,
  hook,
  tagline,
  audioFile,
  captionCues,
  layout = "portrait",
}) => {
  const frame = useCurrentFrame();
  const baseScale = layout === "landscape" ? 0.72 : 1;
  const bgKey = VARIANT_BG[variant] ?? "hotel";
  const bgClip = BG_CLIPS[bgKey];

  const hookOpacity = interpolate(frame, [0, 6, 46, 58], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phoneOpacity = interpolate(frame, [SCREEN_START, SCREEN_START + 18, CTA_START - 20, CTA_START], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phoneScale =
    baseScale *
    interpolate(frame, [SCREEN_START, SCREEN_START + 30], [0.82, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const ctaOpacity = interpolate(frame, [CTA_START, CTA_START + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
      {/* Real royalty-free bed ("Upbeat Corporate" by leberch, via Pixabay -
          no attribution required for commercial use, credited anyway in the
          YouTube description), ducked well under the voiceover and faded
          out before the CTA holds so it never masks the spoken tagline. */}
      <Audio
        src={staticFile("audio/bgm.mp3")}
        volume={(f) =>
          interpolate(f, [0, 20, CTA_START - 10, CTA_START + 10], [0, 0.11, 0.11, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      {/* Two short, real Pixabay SFX stingers marking the two scene cuts -
          a quick whoosh as the phone mockup reveals, a soft chime as the
          CTA lands - both trimmed to a brief fade in/out via the volume
          envelope regardless of the source clip's own length, so neither
          lingers over the voiceover. */}
      <Sequence from={SCREEN_START} durationInFrames={40}>
        <Audio
          src={staticFile("audio/whoosh.mp3")}
          volume={(f) =>
            interpolate(f, [0, 3, 25, 40], [0, 0.32, 0.32, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      </Sequence>
      <Sequence from={CTA_START} durationInFrames={45}>
        <Audio
          src={staticFile("audio/chime.mp3")}
          volume={(f) =>
            interpolate(f, [0, 2, 30, 45], [0, 0.3, 0.3, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      </Sequence>

      {hookOpacity > 0.01 && (
        <AbsoluteFill style={{ opacity: hookOpacity }}>
          <HookCard text={hook} bgVideo={bgClip.name} />
        </AbsoluteFill>
      )}

      {phoneOpacity > 0.01 && (
        <AbsoluteFill
          style={{
            background: theme.soft,
            alignItems: "center",
            justifyContent: "center",
            opacity: phoneOpacity,
          }}
        >
          <PhoneFrame scale={phoneScale}>
            <FeatureScreen variant={variant} startFrame={SCREEN_START} />
          </PhoneFrame>
        </AbsoluteFill>
      )}

      {ctaOpacity > 0.01 && (
        <AbsoluteFill style={{ opacity: ctaOpacity }}>
          <CTACard tagline={tagline} bgVideo={bgClip.name} bgStartFrom={bgClip.ctaStartFrom} />
        </AbsoluteFill>
      )}

      {/* Only during hook + feature screen - the CTA card already shows its
          tagline as large on-screen text, so a second caption there would
          just duplicate it. */}
      {captionCues && frame < CTA_START && <Captions cues={captionCues} />}
    </AbsoluteFill>
  );
};

export const AD_TOTAL_FRAMES = TOTAL;
