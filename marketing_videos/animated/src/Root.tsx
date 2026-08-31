import React from "react";
import { Composition } from "remotion";
import { StayRankAd, AdConfig, AD_TOTAL_FRAMES } from "./StayRankAd";
import { ChannelBanner } from "./components/ChannelBanner";
import { ChannelIcon } from "./components/ChannelIcon";

import searchCues from "../public/audio/search.words.json";
import reviewsCues from "../public/audio/reviews.words.json";
import pricewatchCues from "../public/audio/pricewatch.words.json";
import neighborhoodCues from "../public/audio/neighborhood.words.json";
import topmatchCues from "../public/audio/topmatch.words.json";
import tripplanCues from "../public/audio/tripplan.words.json";
import languageCues from "../public/audio/language.words.json";
import darkmodeCues from "../public/audio/darkmode.words.json";
import compareCues from "../public/audio/compare.words.json";
import askhotelCues from "../public/audio/askhotel.words.json";
import guestfavoriteCues from "../public/audio/guestfavorite.words.json";
import landmarkCues from "../public/audio/landmark.words.json";
import cancellationCues from "../public/audio/cancellation.words.json";
import packingCues from "../public/audio/packing.words.json";
import sustainabilityCues from "../public/audio/sustainability.words.json";
import accessibleCues from "../public/audio/accessible.words.json";
import petfriendlyCues from "../public/audio/petfriendly.words.json";
import exportCues from "../public/audio/export.words.json";
import noiseCues from "../public/audio/noise.words.json";
import recentlyviewedCues from "../public/audio/recentlyviewed.words.json";
import currencyCues from "../public/audio/currency.words.json";
import besttimeCues from "../public/audio/besttime.words.json";
import transitCues from "../public/audio/transit.words.json";
import datasourceCues from "../public/audio/datasource.words.json";
import shareurlCues from "../public/audio/shareurl.words.json";
import printplanCues from "../public/audio/printplan.words.json";
import recentcitiesCues from "../public/audio/recentcities.words.json";
import refineCues from "../public/audio/refine.words.json";
import personaCues from "../public/audio/persona.words.json";
import verifiedstarCues from "../public/audio/verifiedstar.words.json";
import automustsCues from "../public/audio/automusts.words.json";
import billingCues from "../public/audio/billing.words.json";

const ADS: AdConfig[] = [
  {
    variant: "search",
    hook: "Tired of clicking through a dozen filters just to find one hotel?",
    tagline: "Describe your trip, not just filters.",
    audioFile: "audio/search.mp3",
    captionCues: searchCues,
  },
  {
    variant: "reviews",
    hook: "What if your hotel reviews were quietly softened?",
    tagline: "No AI review smoothing. Ever.",
    audioFile: "audio/reviews.mp3",
    captionCues: reviewsCues,
  },
  {
    variant: "pricewatch",
    hook: "Ever wonder if that hotel price is actually a good deal?",
    tagline: "Real price tracking. Zero spam.",
    audioFile: "audio/pricewatch.mp3",
    captionCues: pricewatchCues,
  },
  {
    variant: "neighborhood",
    hook: "Still guessing which neighborhood to stay in?",
    tagline: "Pick the exact neighborhood. Not just the city.",
    audioFile: "audio/neighborhood.mp3",
    captionCues: neighborhoodCues,
  },
  {
    variant: "topmatch",
    hook: "Ever wonder why a hotel is ranked number one?",
    tagline: "Every ranking, explainable. Never a paid placement.",
    audioFile: "audio/topmatch.mp3",
    captionCues: topmatchCues,
  },
  {
    variant: "tripplan",
    hook: "Still juggling five different apps for one trip?",
    tagline: "Real weather, real places, real flight estimates — one plan.",
    audioFile: "audio/tripplan.mp3",
    captionCues: tripplanCues,
  },
  {
    variant: "language",
    hook: "Traveling abroad shouldn't mean a translation app too.",
    tagline: "Search hotels in 6 languages, fully translated.",
    audioFile: "audio/language.mp3",
    captionCues: languageCues,
  },
  {
    variant: "darkmode",
    hook: "Dark mode that's actually readable?",
    tagline: "Every color, contrast-checked. Not just inverted.",
    audioFile: "audio/darkmode.mp3",
    captionCues: darkmodeCues,
  },
  {
    variant: "compare",
    hook: "Still comparing hotels across fifteen open tabs?",
    tagline: "Compare hotels, side by side.",
    audioFile: "audio/compare.mp3",
    captionCues: compareCues,
  },
  {
    variant: "askhotel",
    hook: "Wish you could just ask the hotel a question?",
    tagline: "Ask this hotel anything. Grounded in real data.",
    audioFile: "audio/askhotel.mp3",
    captionCues: askhotelCues,
  },
  {
    variant: "guestfavorite",
    hook: "That Guest Favorite badge — is it even real?",
    tagline: "A real badge, computed from real reviews. Never for sale.",
    audioFile: "audio/guestfavorite.mp3",
    captionCues: guestfavoriteCues,
  },
  {
    variant: "landmark",
    hook: "Need a hotel near one specific place?",
    tagline: "Real distance, to the place that matters.",
    audioFile: "audio/landmark.mp3",
    captionCues: landmarkCues,
  },
  {
    variant: "cancellation",
    hook: "Which hotels can you actually cancel for free?",
    tagline: "Free cancellation, clearly marked. Never assumed.",
    audioFile: "audio/cancellation.mp3",
    captionCues: cancellationCues,
  },
  {
    variant: "packing",
    hook: "Tired of generic packing list apps?",
    tagline: "A packing list, built from real weather.",
    audioFile: "audio/packing.mp3",
    captionCues: packingCues,
  },
  {
    variant: "sustainability",
    hook: "Wondering if a hotel's eco badge is actually earned?",
    tagline: "Real certifications, never invented.",
    audioFile: "audio/sustainability.mp3",
    captionCues: sustainabilityCues,
  },
  {
    variant: "accessible",
    hook: "Need a hotel that's actually accessible?",
    tagline: "Accessible, for real. Never assumed.",
    audioFile: "audio/accessible.mp3",
    captionCues: accessibleCues,
  },
  {
    variant: "petfriendly",
    hook: "Traveling with a dog or cat?",
    tagline: "Pet-friendly, for real.",
    audioFile: "audio/petfriendly.mp3",
    captionCues: petfriendlyCues,
  },
  {
    variant: "export",
    hook: "Done planning and don't want to retype everything?",
    tagline: "Export your trip, in two taps.",
    audioFile: "audio/export.mp3",
    captionCues: exportCues,
  },
  {
    variant: "noise",
    hook: "Wondering if a hotel is actually quiet at night?",
    tagline: "Quiet or lively, actually checked.",
    audioFile: "audio/noise.mp3",
    captionCues: noiseCues,
  },
  {
    variant: "recentlyviewed",
    hook: "Lost track of which hotels you already checked?",
    tagline: "Recently viewed, always saved.",
    audioFile: "audio/recentlyviewed.mp3",
    captionCues: recentlyviewedCues,
  },
  {
    variant: "currency",
    hook: "Traveling somewhere with a different currency?",
    tagline: "Real rates, updated daily.",
    audioFile: "audio/currency.mp3",
    captionCues: currencyCues,
  },
  {
    variant: "besttime",
    hook: "Wondering when to actually visit?",
    tagline: "Real weather, month by month.",
    audioFile: "audio/besttime.mp3",
    captionCues: besttimeCues,
  },
  {
    variant: "transit",
    hook: "Tired of a vague transit score with no context?",
    tagline: "The real station, by name.",
    audioFile: "audio/transit.mp3",
    captionCues: transitCues,
  },
  {
    variant: "datasource",
    hook: "What happens when a hotel data source goes down?",
    tagline: "Real data, even when one source fails.",
    audioFile: "audio/datasource.mp3",
    captionCues: datasourceCues,
  },
  {
    variant: "shareurl",
    hook: "Want to send your exact search to a travel companion?",
    tagline: "Your search, in one real link.",
    audioFile: "audio/shareurl.mp3",
    captionCues: shareurlCues,
  },
  {
    variant: "printplan",
    hook: "Want your itinerary on paper, not just a screen?",
    tagline: "Print your itinerary, in one click.",
    audioFile: "audio/printplan.mp3",
    captionCues: printplanCues,
  },
  {
    variant: "recentcities",
    hook: "Planning a multi-city trip?",
    tagline: "Recently searched, one tap back.",
    audioFile: "audio/recentcities.mp3",
    captionCues: recentcitiesCues,
  },
  {
    variant: "refine",
    hook: "Wish you could just say \"cheaper\" or \"closer to the station\"?",
    tagline: "Refine in plain English, instantly re-ranked.",
    audioFile: "audio/refine.mp3",
    captionCues: refineCues,
  },
  {
    variant: "persona",
    hook: "Traveling for business instead of leisure?",
    tagline: "Weights that shift, and show their work.",
    audioFile: "audio/persona.mp3",
    captionCues: personaCues,
  },
  {
    variant: "verifiedstar",
    hook: "Ever notice a hotel's star rating just feels inflated?",
    tagline: "The verified star rating, not the inflated one.",
    audioFile: "audio/verifiedstar.mp3",
    captionCues: verifiedstarCues,
  },
  {
    variant: "automusts",
    hook: "Ever type \"walking distance to subway\" and wonder what that did?",
    tagline: "Never a silent filter, always undoable.",
    audioFile: "audio/automusts.mp3",
    captionCues: automustsCues,
  },
  {
    variant: "billing",
    hook: "Worried about handing over your card number?",
    tagline: "Secure billing, real Stripe checkout.",
    audioFile: "audio/billing.mp3",
    captionCues: billingCues,
  },
];

export const Root: React.FC = () => {
  return (
    <>
      {ADS.map((ad) => (
        <Composition
          key={ad.variant}
          id={ad.variant}
          component={StayRankAd}
          durationInFrames={AD_TOTAL_FRAMES}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={ad}
        />
      ))}

      {/* Landscape (16:9) cuts for standard YouTube video placement, not
          just Shorts - only the two strongest, most differentiated angles
          (search and reviews/honesty), not all 8, to avoid producing
          redundant renders nobody's asked to see yet. */}
      {[ADS[0], ADS[1]].map((ad) => (
        <Composition
          key={`${ad.variant}-landscape`}
          id={`${ad.variant}-landscape`}
          component={StayRankAd}
          durationInFrames={AD_TOTAL_FRAMES}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ ...ad, layout: "landscape" }}
        />
      ))}

      {/* YouTube channel art - not an ad, a still asset for actually
          launching the channel these videos would live on. */}
      <Composition
        id="channel-banner"
        component={ChannelBanner}
        durationInFrames={1}
        fps={30}
        width={2560}
        height={1440}
      />
      <Composition
        id="channel-icon"
        component={ChannelIcon}
        durationInFrames={1}
        fps={30}
        width={800}
        height={800}
      />
    </>
  );
};
