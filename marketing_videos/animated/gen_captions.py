"""Regenerates each ad's voiceover with edge-tts's own boundary timing
captured live, so captions are burned in synced to the real audio - not a
guessed even split. Captions matter here specifically because research
this tick found captions are essential for silent autoplay viewing on
Shorts/TikTok/Instagram, which this project's ads didn't have yet.

This edge-tts version/voice only emits SentenceBoundary events (checked
live - WordBoundary never fired, despite the SubMaker API supporting it),
so captions are sentence-level, not word-by-word karaoke - still a real,
accurately-timed improvement over no captions at all, and a completely
normal caption style for short-form ads. Outputs both the .mp3 and a
.json cue-timing file Remotion reads to render synced caption text.
"""
import asyncio
import json
import sys

import edge_tts

VOICE = "en-US-AvaNeural"
RATE = "+6%"

SCRIPTS = {
    "search": "Tired of clicking through a dozen filters just to find one hotel? Just describe your trip. StayRank AI reads it, and ranks real hotels to match, instantly. StayRank AI. Describe your trip, not just filters.",
    "reviews": "What if your hotel reviews were quietly softened before you ever saw them? StayRank AI never does that. Every real guest keyword stays visible, including the red flags other apps smooth away. StayRank AI. No A I review smoothing. Ever.",
    "pricewatch": "Ever wonder if that hotel price is actually a good deal? StayRank AI quietly tracks the real price, every time you look. No predictions, no spam, just what actually changed. StayRank AI. Real price tracking, zero spam.",
    "neighborhood": "Still guessing which neighborhood to stay in? StayRank AI lets you pick the exact neighborhood, not just the city, narrowing real hotels instantly. StayRank AI. Pick the exact neighborhood. Not just the city.",
    "topmatch": "Ever wonder why a hotel is ranked number one? At StayRank AI, that's never a paid placement. It's the highest score from our own transparent model, and you can inspect every weight behind it. StayRank AI. Every ranking, explainable.",
    "tripplan": "Still juggling five different apps for one trip? StayRank AI pulls it into one plan: real weather, real nearby places, a real flight estimate, never a fake quote. StayRank AI. One plan, real data.",
    "language": "Traveling abroad shouldn't mean a translation app too. Search hotels in English, Spanish, French, German, Portuguese, or Chinese, fully translated. StayRank AI. Search hotels in six languages.",
    "darkmode": "Dark mode that's actually readable? StayRank AI checks every single color for real contrast, badges and buttons included, not just inverted colors that look clean but read terribly. StayRank AI. Every color, contrast checked.",
    "compare": "Still comparing hotels across fifteen open tabs? StayRank AI puts your shortlist on one radar chart, quiet, transit, value, clean, room, side by side. StayRank AI. Compare hotels, side by side.",
    "askhotel": "Wish you could just ask the hotel a question? StayRank AI answers, grounded only in that hotel's own real data. If it doesn't know, it says so, it never guesses. StayRank AI. Ask this hotel anything.",
    "guestfavorite": "That Guest Favorite badge, is it even real? At StayRank AI, it's computed only from real Booking dot com review volume and score, never a sponsored badge, never bought. StayRank AI. A real badge, never for sale.",
    "landmark": "Need a hotel near one specific place? Just type the landmark. StayRank AI shows real walking distance and time to every hotel, using real routing, not a straight line guess. StayRank AI. Real distance, to the place that matters.",
    "cancellation": "Wondering which hotels you can actually cancel for free? StayRank AI marks it clearly, only when the real Booking dot com policy confirms it, never assumed. StayRank AI. Free cancellation, clearly marked.",
    "packing": "Tired of generic packing list apps? StayRank AI builds yours from the real forecast for your actual trip, real UV index, real rain chance, real low temperature. StayRank AI. A packing list, built from real weather.",
    "sustainability": "Wondering if a hotel's eco badge is actually earned? StayRank AI only shows real, third party certifications, like Green Key or EarthCheck, never a made up eco score. StayRank AI. Real certifications, never invented.",
    "accessible": "Need a hotel that's actually accessible? Just flip the filter. StayRank AI only keeps hotels with real, listed features, step free entrances, roll in showers, nothing assumed. StayRank AI. Accessible, for real.",
    "petfriendly": "Traveling with a dog or cat? Just flip the pet friendly filter. StayRank AI only keeps hotels with a real, listed pet policy, straight from the listing, never guessed. StayRank AI. Pet friendly, for real.",
    "export": "Done planning and don't want to retype everything? Export your trip. StayRank AI hands you a real calendar file for check in and check out, and a real map file for every shortlisted hotel. StayRank AI. Export your trip, in two taps.",
    "noise": "Wondering if a hotel is actually quiet at night? StayRank AI checks real nearby nightlife venues and major roads, and labels it likely quiet or likely lively, no vibe guessing. StayRank AI. Quiet or lively, actually checked.",
    "recentlyviewed": "Lost track of which hotels you already checked? StayRank AI remembers every hotel you've viewed, so you can pick up right where you left off. StayRank AI. Recently viewed, always saved.",
    "currency": "Traveling somewhere with a different currency? StayRank AI converts every price using today's real exchange rate, straight from the European Central Bank, never a stale or made up number. StayRank AI. Real rates, updated daily.",
    "besttime": "Wondering when to actually visit? StayRank AI shows three years of real historical weather, month by month, and calls out the mildest, driest month, no fake crowd score, no fake price score. StayRank AI. Real weather, month by month.",
    "transit": "Tired of a vague transit score with no context? StayRank AI shows the real, named nearest station, subway or rail, with a real distance, not just a number out of a hundred. StayRank AI. The real station, by name.",
    "datasource": "What happens when a hotel data source goes down? StayRank AI automatically falls back to another real source, so you still get real hotels, never fabricated data, never a fake listing. StayRank AI. Real data, even when one source fails.",
    "shareurl": "Want to send your exact search to a travel companion? StayRank AI puts your whole search, filters, dates, budget, into one real link, no re-typing anything. StayRank AI. Your search, in one real link.",
    "printplan": "Want your itinerary on paper, not just a screen? StayRank AI builds a clean, print ready page, no ads, no clutter, just your plan. StayRank AI. Print your itinerary, in one click.",
    "recentcities": "Planning a multi city trip? StayRank AI remembers every city you've actually searched, so you can jump back in with one tap, never a fabricated trending list. StayRank AI. Recently searched, one tap back.",
    "refine": "Wish you could just say cheaper, or closer to the station? Type it. StayRank AI re-ranks the same real hotels instantly, no new fetch, no fake results. StayRank AI. Refine in plain English, instantly re-ranked.",
    "persona": "Traveling for business instead of leisure? Pick your trip type. StayRank AI shifts the real ranking weights, wifi and transit matter more, and shows you exactly what changed. StayRank AI. Weights that shift, and show their work.",
    "verifiedstar": "Ever notice a hotel's star rating just feels inflated? When a real, independently verified rating exists, StayRank AI shows that one instead, never the self-reported number alone. StayRank AI. The verified star rating, not the inflated one.",
    "automusts": "Ever type walking distance to subway and wonder what that actually did to your results? StayRank AI shows you exactly which requirement it silently applied, and lets you uncheck it. StayRank AI. Never a silent filter, always undoable.",
    "billing": "Worried about handing over your card number? Trip Planner Pro uses real Stripe hosted checkout. StayRank AI never sees your card number, ever, and you can cancel anytime from your own billing portal. StayRank AI. Secure billing, real Stripe checkout.",
}


async def generate_one(name: str, text: str) -> None:
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
    cues = []
    with open(f"public/audio/{name}.mp3", "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "SentenceBoundary":
                cues.append(
                    {
                        "text": chunk["text"],
                        "startMs": chunk["offset"] / 10000,
                        "endMs": (chunk["offset"] + chunk["duration"]) / 10000,
                    }
                )
    with open(f"public/audio/{name}.words.json", "w", encoding="utf-8") as f:
        json.dump(cues, f, ensure_ascii=False, indent=2)
    print(f"{name}: {len(cues)} sentence cues captured")


async def main():
    names = sys.argv[1:] or list(SCRIPTS.keys())
    for name in names:
        await generate_one(name, SCRIPTS[name])


if __name__ == "__main__":
    asyncio.run(main())
