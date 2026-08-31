"""Mock but realistic-shaped multi-city hotel dataset used to seed data/hotels.db.

Each city has several neighborhoods, each neighborhood has a short description
(used as part of the semantic search corpus) and two hotels at different
price/quality tiers, so filtering, sorting, and semantic ranking all have
something interesting to work with even within a single neighborhood.

star_rating and latitude/longitude are approximate real-world values for
these well-known neighborhoods, so the map view and star-rating display work
for curated cities too, not just live-synced ones.

Every hotel's "photos" field pairs its "image" with one other real,
already-used Unsplash URL from this same file's pool - both illustrative
stock photography, same as the single "image" already was (see the
"curated" source-tier disclosure in the frontend's data-sources panel).
Not claiming to be actual photos of that specific property; just enough
variety for the photo gallery/cycle UI to have something real to show
instead of sitting permanently hidden behind a "needs 2+ photos" gate.
"""

CITIES = [
    {
        "name": "Tokyo",
        "country": "Japan",
        "hero_image": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=900&q=80",
        "neighborhoods": [
            {
                "name": "Kanda / Otemachi",
                "description": "A quiet business district in central Tokyo with fast subway access and efficient hotels favored by business travelers.",
                "hotels": [
                    {
                        "slug": "kanda-grove",
                        "name": "Kanda Grove Hotel",
                        "price": 168,
                        "rating": 4.6,
                        "star_rating": 4,
                        "latitude": 35.6918,
                        "longitude": 139.7649,
                        "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["quiet", "transit", "business"],
                        "metrics": {"quiet": 91, "cleanliness": 92, "transit": 95, "roomSize": 68, "value": 86, "family": 65, "couple": 83, "nightlife": 24, "breakfast": 77, "wifi": 89},
                        "strengths": ["2 subway lines within 5 minutes", "low noise complaints", "excellent desk setup"],
                        "risk": "Rooms are efficient rather than spacious.",
                        "evidence": "Review pattern: guests frequently mention quiet nights, fast check-in, and easy metro access; room size is the main repeated complaint."
                    },
                    {
                        "slug": "otemachi-business-inn",
                        "name": "Otemachi Business Inn",
                        "price": 128,
                        "rating": 4.3,
                        "star_rating": 3,
                        "latitude": 35.6905,
                        "longitude": 139.7661,
                        "image": "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "value", "business"],
                        "metrics": {"quiet": 84, "cleanliness": 85, "transit": 92, "roomSize": 58, "value": 91, "family": 58, "couple": 72, "nightlife": 26, "breakfast": 68, "wifi": 85},
                        "strengths": ["walking distance to Otemachi station", "efficient compact rooms", "budget-friendly for a business district"],
                        "risk": "Very compact rooms, minimal common space.",
                        "evidence": "Review pattern: guests praise the unbeatable transit access and price; frequent notes about tight room layouts."
                    }
                ]
            },
            {
                "name": "Ginza / Yurakucho",
                "description": "An upscale shopping and dining district with polished hotels, popular with couples, that gets busy on weekends.",
                "hotels": [
                    {
                        "slug": "ginza-mori",
                        "name": "Ginza Mori Residence",
                        "price": 214,
                        "rating": 4.7,
                        "star_rating": 5,
                        "latitude": 35.6717,
                        "longitude": 139.7650,
                        "image": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["couple", "transit", "clean"],
                        "metrics": {"quiet": 78, "cleanliness": 96, "transit": 93, "roomSize": 72, "value": 70, "family": 72, "couple": 94, "nightlife": 51, "breakfast": 85, "wifi": 86},
                        "strengths": ["premium shopping area", "polished rooms", "great couple reviews"],
                        "risk": "Usually above budget and the area gets busy on weekends.",
                        "evidence": "Review pattern: strong praise for service and cleanliness; some travelers warn that rates jump sharply near holidays."
                    },
                    {
                        "slug": "yurakucho-compact-suites",
                        "name": "Yurakucho Compact Suites",
                        "price": 172,
                        "rating": 4.4,
                        "star_rating": 4,
                        "latitude": 35.6745,
                        "longitude": 139.7631,
                        "image": "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "couple", "value"],
                        "metrics": {"quiet": 70, "cleanliness": 90, "transit": 95, "roomSize": 62, "value": 78, "family": 66, "couple": 84, "nightlife": 58, "breakfast": 76, "wifi": 88},
                        "strengths": ["same prime Ginza location for less", "steps from Yurakucho station", "modern compact design"],
                        "risk": "Smaller rooms than the area's luxury hotels.",
                        "evidence": "Review pattern: guests love getting a Ginza address without the top-tier price; room size is the recurring tradeoff."
                    }
                ]
            },
            {
                "name": "Ueno / Okachimachi",
                "description": "A value-friendly area near parks and museums with good train access and slightly older streets.",
                "hotels": [
                    {
                        "slug": "ueno-nest",
                        "name": "Ueno Nest Hotel",
                        "price": 122,
                        "rating": 4.3,
                        "star_rating": 3,
                        "latitude": 35.7089,
                        "longitude": 139.7745,
                        "image": "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "transit", "family"],
                        "metrics": {"quiet": 70, "cleanliness": 84, "transit": 90, "roomSize": 64, "value": 94, "family": 82, "couple": 72, "nightlife": 42, "breakfast": 68, "wifi": 80},
                        "strengths": ["excellent price", "near JR and metro", "good for museums and parks"],
                        "risk": "Some streets nearby feel older and less polished.",
                        "evidence": "Review pattern: value and convenience dominate; complaints cluster around dated bathrooms and occasional corridor noise."
                    },
                    {
                        "slug": "ueno-park-suites",
                        "name": "Ueno Park Suites",
                        "price": 156,
                        "rating": 4.5,
                        "star_rating": 4,
                        "latitude": 35.7141,
                        "longitude": 139.7718,
                        "image": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["family", "quiet", "space"],
                        "metrics": {"quiet": 76, "cleanliness": 89, "transit": 86, "roomSize": 78, "value": 82, "family": 90, "couple": 76, "nightlife": 36, "breakfast": 79, "wifi": 83},
                        "strengths": ["larger family suites near Ueno Park", "renovated bathrooms", "walk to the zoo and museums"],
                        "risk": "Priced above the neighborhood average.",
                        "evidence": "Review pattern: families highlight the extra space and park access; a few note it costs more than nearby budget options."
                    }
                ]
            },
            {
                "name": "Asakusa / Sumida",
                "description": "A classic, calmer riverside district with traditional Tokyo atmosphere and comfortable room sizes.",
                "hotels": [
                    {
                        "slug": "asakusa-river",
                        "name": "Asakusa River View",
                        "price": 146,
                        "rating": 4.5,
                        "star_rating": 4,
                        "latitude": 35.7118,
                        "longitude": 139.7966,
                        "image": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["couple", "quiet", "value"],
                        "metrics": {"quiet": 86, "cleanliness": 88, "transit": 78, "roomSize": 76, "value": 88, "family": 84, "couple": 86, "nightlife": 27, "breakfast": 73, "wifi": 78},
                        "strengths": ["calmer evenings", "larger rooms for price", "classic Tokyo atmosphere"],
                        "risk": "Less central for late-night cross-city plans.",
                        "evidence": "Review pattern: travelers like the view, calm streets, and room comfort; transit is good but not as fast as Ginza or Kanda."
                    },
                    {
                        "slug": "sumida-riverside-inn",
                        "name": "Sumida Riverside Inn",
                        "price": 98,
                        "rating": 4.1,
                        "star_rating": 2,
                        "latitude": 35.7096,
                        "longitude": 139.7981,
                        "image": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1493707553966-283afac8c358?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "quiet", "transit"],
                        "metrics": {"quiet": 78, "cleanliness": 80, "transit": 70, "roomSize": 60, "value": 93, "family": 68, "couple": 74, "nightlife": 30, "breakfast": 62, "wifi": 74},
                        "strengths": ["lowest price in the district", "still a short walk to Senso-ji", "friendly small inn"],
                        "risk": "Basic amenities and older fixtures.",
                        "evidence": "Review pattern: budget travelers love the price and location; comments mention dated furniture and thin towels."
                    }
                ]
            },
            {
                "name": "Shinjuku",
                "description": "A high-energy transit hub with nightlife, food, and the best late-night transport connections.",
                "hotels": [
                    {
                        "slug": "shinjuku-pulse",
                        "name": "Shinjuku Pulse Hotel",
                        "price": 181,
                        "rating": 4.4,
                        "star_rating": 4,
                        "latitude": 35.6938,
                        "longitude": 139.7034,
                        "image": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "nightlife"],
                        "metrics": {"quiet": 49, "cleanliness": 86, "transit": 98, "roomSize": 66, "value": 76, "family": 58, "couple": 78, "nightlife": 91, "breakfast": 75, "wifi": 84},
                        "strengths": ["best late-night transport", "huge food choice", "easy airport access"],
                        "risk": "Not ideal if quiet sleep is a hard requirement.",
                        "evidence": "Review pattern: guests love convenience and food access; noise and crowds are the clearest recurring negatives."
                    },
                    {
                        "slug": "shinjuku-skyline-tower",
                        "name": "Shinjuku Skyline Tower",
                        "price": 245,
                        "rating": 4.6,
                        "star_rating": 5,
                        "latitude": 35.6912,
                        "longitude": 139.6997,
                        "image": "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "couple", "business"],
                        "metrics": {"quiet": 58, "cleanliness": 93, "transit": 97, "roomSize": 74, "value": 68, "family": 62, "couple": 88, "nightlife": 82, "breakfast": 84, "wifi": 90},
                        "strengths": ["panoramic skyline views", "upscale rooms above the noise", "direct access to Shinjuku station"],
                        "risk": "Premium pricing for the area.",
                        "evidence": "Review pattern: guests love the views and quieter upper floors; value-focused travelers note the higher rate."
                    }
                ]
            },
            {
                "name": "Akihabara",
                "description": "An electronics and anime district with fast Wi-Fi, popular with solo tech travelers.",
                "hotels": [
                    {
                        "slug": "akihabara-stay",
                        "name": "Akihabara Stay Lab",
                        "price": 154,
                        "rating": 4.2,
                        "star_rating": 3,
                        "latitude": 35.6984,
                        "longitude": 139.7731,
                        "image": "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "value"],
                        "metrics": {"quiet": 62, "cleanliness": 82, "transit": 92, "roomSize": 60, "value": 84, "family": 55, "couple": 68, "nightlife": 67, "breakfast": 61, "wifi": 93},
                        "strengths": ["fast Wi-Fi", "electronics and anime area", "easy rail links"],
                        "risk": "Rooms skew compact and the vibe is specific.",
                        "evidence": "Review pattern: solo travelers and tech visitors rate it highly; couples looking for calm atmosphere are more mixed."
                    },
                    {
                        "slug": "akihabara-capsule-deluxe",
                        "name": "Akihabara Capsule Deluxe",
                        "price": 84,
                        "rating": 4.0,
                        "star_rating": 2,
                        "latitude": 35.6998,
                        "longitude": 139.7714,
                        "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "transit", "wifi"],
                        "metrics": {"quiet": 68, "cleanliness": 86, "transit": 88, "roomSize": 42, "value": 95, "family": 40, "couple": 55, "nightlife": 60, "breakfast": 58, "wifi": 96},
                        "strengths": ["extremely low price", "fastest Wi-Fi in the dataset", "efficient capsule-style rooms"],
                        "risk": "Very small rooms, not for guests needing space.",
                        "evidence": "Review pattern: solo budget travelers and gamers love the price and connection speed; families and couples find the rooms too small."
                    }
                ]
            }
        ]
    },
    {
        "name": "Kyoto",
        "country": "Japan",
        "hero_image": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80",
        "neighborhoods": [
            {
                "name": "Gion",
                "description": "Kyoto's historic geisha district with traditional machiya inns, quiet lanes, and easy walks to Yasaka Shrine.",
                "hotels": [
                    {
                        "slug": "gion-machiya-retreat",
                        "name": "Gion Machiya Retreat",
                        "price": 176,
                        "rating": 4.7,
                        "star_rating": 4,
                        "latitude": 35.0037,
                        "longitude": 135.7788,
                        "image": "https://images.unsplash.com/photo-1493707553966-283afac8c358?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1493707553966-283afac8c358?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["couple", "quiet", "clean"],
                        "metrics": {"quiet": 89, "cleanliness": 93, "transit": 74, "roomSize": 70, "value": 78, "family": 60, "couple": 92, "nightlife": 30, "breakfast": 88, "wifi": 75},
                        "strengths": ["traditional kaiseki breakfast", "tatami rooms with garden view", "walk to Yasaka Shrine"],
                        "risk": "Narrow staircases and thin walls in the older wing.",
                        "evidence": "Review pattern: guests love the authentic atmosphere and breakfast; a few mention creaky floors at night."
                    },
                    {
                        "slug": "gion-simple-ryokan",
                        "name": "Gion Simple Ryokan",
                        "price": 118,
                        "rating": 4.2,
                        "star_rating": 3,
                        "latitude": 35.0021,
                        "longitude": 135.7761,
                        "image": "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "quiet", "couple"],
                        "metrics": {"quiet": 84, "cleanliness": 86, "transit": 68, "roomSize": 58, "value": 88, "family": 54, "couple": 80, "nightlife": 28, "breakfast": 72, "wifi": 68},
                        "strengths": ["authentic ryokan feel for less", "still steps from Gion's lantern-lit streets", "friendly family-run service"],
                        "risk": "Shared bathroom facilities in some rooms.",
                        "evidence": "Review pattern: guests appreciate the affordable authenticity; some note shared facilities aren't for everyone."
                    }
                ]
            },
            {
                "name": "Kyoto Station / Karasuma",
                "description": "The transit hub of Kyoto with shinkansen access and efficient modern business hotels.",
                "hotels": [
                    {
                        "slug": "karasuma-station-hotel",
                        "name": "Karasuma Station Hotel",
                        "price": 132,
                        "rating": 4.4,
                        "star_rating": 3,
                        "latitude": 34.9858,
                        "longitude": 135.7588,
                        "image": "https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1551776235-dde6d482980b?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "business", "value"],
                        "metrics": {"quiet": 62, "cleanliness": 88, "transit": 97, "roomSize": 63, "value": 84, "family": 68, "couple": 74, "nightlife": 45, "breakfast": 70, "wifi": 91},
                        "strengths": ["direct shinkansen and JR access", "24-hour convenience stores nearby", "efficient business-class rooms"],
                        "risk": "Station-adjacent noise on lower floors.",
                        "evidence": "Review pattern: business travelers highlight speed and connectivity; some note traffic noise near the station exit."
                    },
                    {
                        "slug": "karasuma-sky-business-hotel",
                        "name": "Karasuma Sky Business Hotel",
                        "price": 178,
                        "rating": 4.6,
                        "star_rating": 4,
                        "latitude": 34.9877,
                        "longitude": 135.7601,
                        "image": "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "business", "space"],
                        "metrics": {"quiet": 70, "cleanliness": 92, "transit": 98, "roomSize": 72, "value": 76, "family": 70, "couple": 80, "nightlife": 48, "breakfast": 82, "wifi": 94},
                        "strengths": ["larger rooms than typical station hotels", "direct shinkansen platform access", "excellent breakfast buffet"],
                        "risk": "Higher price than basic station hotels.",
                        "evidence": "Review pattern: business travelers value the space and connectivity; some mention it costs more than nearby options."
                    }
                ]
            },
            {
                "name": "Arashiyama",
                "description": "A peaceful riverside district near the bamboo grove, popular with families and nature lovers, farther from downtown.",
                "hotels": [
                    {
                        "slug": "arashiyama-bamboo-lodge",
                        "name": "Arashiyama Bamboo Lodge",
                        "price": 158,
                        "rating": 4.6,
                        "star_rating": 4,
                        "latitude": 35.0094,
                        "longitude": 135.6675,
                        "image": "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1521783988139-89397d761dce?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["quiet", "space", "family"],
                        "metrics": {"quiet": 90, "cleanliness": 90, "transit": 58, "roomSize": 85, "value": 80, "family": 88, "couple": 82, "nightlife": 18, "breakfast": 80, "wifi": 70},
                        "strengths": ["steps from the bamboo grove", "spacious family suites", "peaceful river views"],
                        "risk": "Farther from central Kyoto; last trains are early.",
                        "evidence": "Review pattern: families and nature lovers rate it highly; convenience to nightlife or late transit is the recurring tradeoff."
                    },
                    {
                        "slug": "arashiyama-river-cottage",
                        "name": "Arashiyama River Cottage",
                        "price": 104,
                        "rating": 4.3,
                        "star_rating": 3,
                        "latitude": 35.0112,
                        "longitude": 135.6699,
                        "image": "https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["quiet", "value", "family"],
                        "metrics": {"quiet": 92, "cleanliness": 84, "transit": 50, "roomSize": 70, "value": 90, "family": 78, "couple": 78, "nightlife": 12, "breakfast": 70, "wifi": 62},
                        "strengths": ["most affordable option near the bamboo grove", "riverside setting", "quiet nights guaranteed"],
                        "risk": "Very limited dining and transit options nearby.",
                        "evidence": "Review pattern: nature lovers on a budget rate it highly; some note you'll need a taxi for evening plans."
                    }
                ]
            },
            {
                "name": "Higashiyama",
                "description": "A hillside temple district with boutique inns, cobblestone streets, and walkable access to Kiyomizu-dera.",
                "hotels": [
                    {
                        "slug": "higashiyama-tea-house-inn",
                        "name": "Higashiyama Tea House Inn",
                        "price": 144,
                        "rating": 4.5,
                        "star_rating": 4,
                        "latitude": 35.0036,
                        "longitude": 135.7796,
                        "image": "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["couple", "quiet", "value"],
                        "metrics": {"quiet": 80, "cleanliness": 91, "transit": 68, "roomSize": 66, "value": 82, "family": 62, "couple": 87, "nightlife": 34, "breakfast": 84, "wifi": 78},
                        "strengths": ["walking distance to Kiyomizu-dera", "boutique tea-ceremony experience", "excellent value for the area"],
                        "risk": "Hilly cobblestone streets make luggage transport harder.",
                        "evidence": "Review pattern: couples praise the intimate charm and breakfast; some note the uphill walk from the nearest bus stop."
                    },
                    {
                        "slug": "higashiyama-boutique-villa",
                        "name": "Higashiyama Boutique Villa",
                        "price": 210,
                        "rating": 4.8,
                        "star_rating": 5,
                        "latitude": 35.0018,
                        "longitude": 135.7812,
                        "image": "https://images.unsplash.com/photo-1493707553966-283afac8c358?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1493707553966-283afac8c358?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["couple", "quiet", "clean"],
                        "metrics": {"quiet": 86, "cleanliness": 96, "transit": 72, "roomSize": 80, "value": 66, "family": 64, "couple": 94, "nightlife": 32, "breakfast": 90, "wifi": 82},
                        "strengths": ["luxury private villa rooms", "personalized tea ceremony service", "impeccable cleanliness"],
                        "risk": "Among the priciest options in Kyoto.",
                        "evidence": "Review pattern: couples celebrating special occasions rate it exceptionally; budget travelers note the premium cost."
                    }
                ]
            }
        ]
    },
    {
        "name": "London",
        "country": "United Kingdom",
        "hero_image": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=900&q=80",
        "neighborhoods": [
            {
                "name": "Shoreditch",
                "description": "A trendy East London nightlife and creative district with strong transit links and fast Wi-Fi.",
                "hotels": [
                    {
                        "slug": "shoreditch-loft-rooms",
                        "name": "Shoreditch Loft Rooms",
                        "price": 214,
                        "rating": 4.3,
                        "star_rating": 4,
                        "latitude": 51.5229,
                        "longitude": -0.0777,
                        "image": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "nightlife", "business"],
                        "metrics": {"quiet": 48, "cleanliness": 85, "transit": 88, "roomSize": 70, "value": 68, "family": 50, "couple": 80, "nightlife": 90, "breakfast": 72, "wifi": 92},
                        "strengths": ["fast Wi-Fi for remote work", "street art and food scene on the doorstep", "Overground and Tube both nearby"],
                        "risk": "Weekend noise from bars below street level.",
                        "evidence": "Review pattern: creatives and remote workers love the energy and connectivity; quiet-seeking guests flag late-night street noise."
                    },
                    {
                        "slug": "shoreditch-budget-pods",
                        "name": "Shoreditch Budget Pods",
                        "price": 142,
                        "rating": 4.0,
                        "star_rating": 2,
                        "latitude": 51.5257,
                        "longitude": -0.0801,
                        "image": "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "nightlife", "transit"],
                        "metrics": {"quiet": 42, "cleanliness": 78, "transit": 84, "roomSize": 48, "value": 90, "family": 36, "couple": 62, "nightlife": 88, "breakfast": 60, "wifi": 88},
                        "strengths": ["cheapest way to stay in trendy Shoreditch", "compact pod-style rooms", "walking distance to the best bars"],
                        "risk": "Very small rooms and thin walls.",
                        "evidence": "Review pattern: budget nightlife-seekers love the price and location; light sleepers report noise from neighboring rooms."
                    }
                ]
            },
            {
                "name": "South Kensington",
                "description": "An elegant museum district with quiet residential streets, popular with families.",
                "hotels": [
                    {
                        "slug": "south-kensington-garden-house",
                        "name": "South Kensington Garden House",
                        "price": 268,
                        "rating": 4.7,
                        "star_rating": 5,
                        "latitude": 51.4941,
                        "longitude": -0.1738,
                        "image": "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["family", "quiet", "clean"],
                        "metrics": {"quiet": 82, "cleanliness": 95, "transit": 86, "roomSize": 78, "value": 62, "family": 85, "couple": 88, "nightlife": 28, "breakfast": 90, "wifi": 84},
                        "strengths": ["steps from the Natural History and Science Museums", "elegant townhouse rooms", "excellent breakfast"],
                        "risk": "Among the pricier options in this dataset.",
                        "evidence": "Review pattern: families and museum-goers consistently praise cleanliness and location; value-focused travelers note the premium price."
                    },
                    {
                        "slug": "kensington-mews-apartments",
                        "name": "Kensington Mews Apartments",
                        "price": 208,
                        "rating": 4.5,
                        "star_rating": 4,
                        "latitude": 51.4967,
                        "longitude": -0.1759,
                        "image": "https://images.unsplash.com/photo-1551776235-dde6d482980b?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1551776235-dde6d482980b?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["family", "space", "quiet"],
                        "metrics": {"quiet": 78, "cleanliness": 91, "transit": 82, "roomSize": 84, "value": 72, "family": 88, "couple": 80, "nightlife": 24, "breakfast": 78, "wifi": 80},
                        "strengths": ["self-catering apartments with more space", "quiet mews setting", "still close to the museums"],
                        "risk": "No daily housekeeping included.",
                        "evidence": "Review pattern: families like the extra space and kitchen; some miss daily room service found at full-service hotels."
                    }
                ]
            },
            {
                "name": "Covent Garden",
                "description": "London's central theatre and shopping district, extremely walkable and popular with first-time visitors.",
                "hotels": [
                    {
                        "slug": "covent-garden-central-stay",
                        "name": "Covent Garden Central Stay",
                        "price": 238,
                        "rating": 4.4,
                        "star_rating": 4,
                        "latitude": 51.5117,
                        "longitude": -0.1240,
                        "image": "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1493707553966-283afac8c358?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "first-time", "nightlife"],
                        "metrics": {"quiet": 52, "cleanliness": 87, "transit": 92, "roomSize": 60, "value": 58, "family": 66, "couple": 82, "nightlife": 78, "breakfast": 74, "wifi": 86},
                        "strengths": ["walkable to West End theatres", "excellent Tube connectivity", "easy first-time navigation"],
                        "risk": "Small rooms and constant foot traffic outside.",
                        "evidence": "Review pattern: first-time visitors love the central base; repeat travelers often prefer a quieter neighborhood next time."
                    },
                    {
                        "slug": "covent-garden-theatre-inn",
                        "name": "Covent Garden Theatre Inn",
                        "price": 168,
                        "rating": 4.1,
                        "star_rating": 3,
                        "latitude": 51.5129,
                        "longitude": -0.1219,
                        "image": "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "transit", "first-time"],
                        "metrics": {"quiet": 48, "cleanliness": 82, "transit": 90, "roomSize": 52, "value": 84, "family": 58, "couple": 76, "nightlife": 74, "breakfast": 66, "wifi": 82},
                        "strengths": ["lowest price in the West End", "still walkable to every theatre", "easy Tube access"],
                        "risk": "Small rooms and street noise.",
                        "evidence": "Review pattern: theatre-goers on a budget rate the location highly; several mention street noise and compact rooms."
                    }
                ]
            },
            {
                "name": "Canary Wharf",
                "description": "A modern business district with spacious rooms, riverside views, and quieter evenings.",
                "hotels": [
                    {
                        "slug": "canary-wharf-riverside-suites",
                        "name": "Canary Wharf Riverside Suites",
                        "price": 196,
                        "rating": 4.5,
                        "star_rating": 4,
                        "latitude": 51.5054,
                        "longitude": -0.0235,
                        "image": "https://images.unsplash.com/photo-1551776235-dde6d482980b?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1551776235-dde6d482980b?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["business", "space", "value"],
                        "metrics": {"quiet": 76, "cleanliness": 92, "transit": 80, "roomSize": 88, "value": 74, "family": 70, "couple": 78, "nightlife": 40, "breakfast": 76, "wifi": 95},
                        "strengths": ["spacious modern suites", "riverside views", "strong Wi-Fi for work trips"],
                        "risk": "Quieter at night; fewer casual dining options within walking distance.",
                        "evidence": "Review pattern: business travelers highlight space and connectivity; leisure travelers note it feels quiet after office hours."
                    },
                    {
                        "slug": "canary-wharf-executive-tower",
                        "name": "Canary Wharf Executive Tower",
                        "price": 262,
                        "rating": 4.7,
                        "star_rating": 5,
                        "latitude": 51.5038,
                        "longitude": -0.0198,
                        "image": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["business", "space", "clean"],
                        "metrics": {"quiet": 80, "cleanliness": 95, "transit": 84, "roomSize": 92, "value": 64, "family": 66, "couple": 80, "nightlife": 42, "breakfast": 82, "wifi": 97},
                        "strengths": ["top-floor executive suites", "fastest Wi-Fi in the dataset", "concierge business services"],
                        "risk": "Among the pricier business options in London.",
                        "evidence": "Review pattern: executives praise the space and service; leisure travelers note the premium rate for a business-only area."
                    }
                ]
            }
        ]
    },
    {
        "name": "New York",
        "country": "United States",
        "hero_image": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=900&q=80",
        "neighborhoods": [
            {
                "name": "Chelsea",
                "description": "An art gallery and High Line neighborhood in Manhattan, popular with couples and design-focused travelers.",
                "hotels": [
                    {
                        "slug": "chelsea-gallery-row-hotel",
                        "name": "Chelsea Gallery Row Hotel",
                        "price": 288,
                        "rating": 4.5,
                        "star_rating": 4,
                        "latitude": 40.7465,
                        "longitude": -74.0014,
                        "image": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["couple", "transit", "clean"],
                        "metrics": {"quiet": 66, "cleanliness": 90, "transit": 84, "roomSize": 68, "value": 58, "family": 60, "couple": 86, "nightlife": 62, "breakfast": 70, "wifi": 88},
                        "strengths": ["steps from the High Line", "gallery-hopping neighborhood", "boutique design rooms"],
                        "risk": "Among the pricier picks; rooms lean compact for the rate.",
                        "evidence": "Review pattern: couples and design fans love the neighborhood; value-conscious travelers flag the price-to-size ratio."
                    },
                    {
                        "slug": "chelsea-budget-studios",
                        "name": "Chelsea Budget Studios",
                        "price": 198,
                        "rating": 4.1,
                        "star_rating": 3,
                        "latitude": 40.7449,
                        "longitude": -73.9989,
                        "image": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "transit", "couple"],
                        "metrics": {"quiet": 60, "cleanliness": 82, "transit": 80, "roomSize": 56, "value": 82, "family": 52, "couple": 76, "nightlife": 58, "breakfast": 62, "wifi": 84},
                        "strengths": ["most affordable base near the High Line", "compact but well-designed studios", "easy subway access"],
                        "risk": "Smaller rooms than nearby luxury options.",
                        "evidence": "Review pattern: value-conscious couples like the location for the price; some want more space."
                    }
                ]
            },
            {
                "name": "Williamsburg",
                "description": "A trendy Brooklyn waterfront neighborhood with strong nightlife and better value than Manhattan.",
                "hotels": [
                    {
                        "slug": "williamsburg-waterfront-inn",
                        "name": "Williamsburg Waterfront Inn",
                        "price": 176,
                        "rating": 4.3,
                        "star_rating": 3,
                        "latitude": 40.7081,
                        "longitude": -73.9571,
                        "image": "https://images.unsplash.com/photo-1521783988139-89397d761dce?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1521783988139-89397d761dce?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "nightlife", "transit"],
                        "metrics": {"quiet": 58, "cleanliness": 84, "transit": 78, "roomSize": 74, "value": 80, "family": 55, "couple": 82, "nightlife": 84, "breakfast": 66, "wifi": 85},
                        "strengths": ["Manhattan skyline views from the roof deck", "best food and bar scene in the dataset", "better value than Manhattan comparables"],
                        "risk": "Subway ride to central Manhattan attractions.",
                        "evidence": "Review pattern: younger travelers and value seekers rate it highly; those wanting to walk everywhere prefer Manhattan instead."
                    },
                    {
                        "slug": "williamsburg-loft-suites",
                        "name": "Williamsburg Loft Suites",
                        "price": 232,
                        "rating": 4.6,
                        "star_rating": 4,
                        "latitude": 40.7112,
                        "longitude": -73.9548,
                        "image": "https://images.unsplash.com/photo-1521783988139-89397d761dce?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1521783988139-89397d761dce?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1551776235-dde6d482980b?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["couple", "space", "nightlife"],
                        "metrics": {"quiet": 62, "cleanliness": 90, "transit": 80, "roomSize": 86, "value": 70, "family": 60, "couple": 86, "nightlife": 80, "breakfast": 74, "wifi": 90},
                        "strengths": ["spacious converted-warehouse lofts", "rooftop skyline views", "steps from the best restaurants"],
                        "risk": "Pricier than typical Brooklyn stays.",
                        "evidence": "Review pattern: couples love the design and views; budget travelers note it costs more than nearby options."
                    }
                ]
            },
            {
                "name": "Midtown Manhattan",
                "description": "The most central and touristy district, walking distance to Times Square with every subway line nearby.",
                "hotels": [
                    {
                        "slug": "midtown-central-tower",
                        "name": "Midtown Central Tower",
                        "price": 246,
                        "rating": 4.2,
                        "star_rating": 4,
                        "latitude": 40.7549,
                        "longitude": -73.9840,
                        "image": "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["transit", "first-time", "nightlife"],
                        "metrics": {"quiet": 40, "cleanliness": 86, "transit": 95, "roomSize": 62, "value": 54, "family": 64, "couple": 72, "nightlife": 88, "breakfast": 68, "wifi": 90},
                        "strengths": ["walk to Times Square and Broadway", "every subway line within reach", "easiest first-time base"],
                        "risk": "Constant street noise and crowds, day and night.",
                        "evidence": "Review pattern: first-time visitors value the location above all else; quiet sleep is the most common complaint."
                    },
                    {
                        "slug": "midtown-value-inn",
                        "name": "Midtown Value Inn",
                        "price": 168,
                        "rating": 3.9,
                        "star_rating": 2,
                        "latitude": 40.7561,
                        "longitude": -73.9871,
                        "image": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1521783988139-89397d761dce?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["value", "transit", "first-time"],
                        "metrics": {"quiet": 38, "cleanliness": 76, "transit": 96, "roomSize": 50, "value": 86, "family": 55, "couple": 64, "nightlife": 84, "breakfast": 58, "wifi": 82},
                        "strengths": ["cheapest base in Midtown", "still steps from Times Square", "every subway line nearby"],
                        "risk": "Basic rooms and constant crowds outside.",
                        "evidence": "Review pattern: first-time budget visitors value the unbeatable location; comfort-focused travelers prefer paying more for quiet."
                    }
                ]
            },
            {
                "name": "Upper West Side",
                "description": "A quiet, family-friendly residential neighborhood beside Central Park.",
                "hotels": [
                    {
                        "slug": "upper-west-side-brownstone",
                        "name": "Upper West Side Brownstone",
                        "price": 224,
                        "rating": 4.6,
                        "star_rating": 4,
                        "latitude": 40.7870,
                        "longitude": -73.9754,
                        "image": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["family", "quiet", "space"],
                        "metrics": {"quiet": 84, "cleanliness": 91, "transit": 82, "roomSize": 80, "value": 66, "family": 90, "couple": 80, "nightlife": 30, "breakfast": 78, "wifi": 83},
                        "strengths": ["one block from Central Park", "spacious family-friendly suites", "calm, residential evenings"],
                        "risk": "Fewer late-night dining options within walking distance.",
                        "evidence": "Review pattern: families and quiet-seekers consistently rate this the calmest option; nightlife-focused travelers prefer downtown instead."
                    },
                    {
                        "slug": "uws-family-suites",
                        "name": "UWS Family Suites",
                        "price": 268,
                        "rating": 4.7,
                        "star_rating": 4,
                        "latitude": 40.7889,
                        "longitude": -73.9731,
                        "image": "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80",
                        "photos": ["https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=700&q=80", "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=700&q=80"],
                        "tags": ["family", "space", "quiet"],
                        "metrics": {"quiet": 82, "cleanliness": 93, "transit": 78, "roomSize": 90, "value": 62, "family": 95, "couple": 74, "nightlife": 26, "breakfast": 80, "wifi": 85},
                        "strengths": ["largest family suites in the dataset", "two blocks from Central Park", "kitchenettes for longer stays"],
                        "risk": "Among the pricier family options.",
                        "evidence": "Review pattern: larger families consistently rate the space highest; smaller budgets note the premium cost."
                    }
                ]
            }
        ]
    }
]
