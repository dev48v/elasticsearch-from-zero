Day 30 - Recipes you can actually find. Type "spagh" → get spaghetti. Misspell "chiken" → still get chicken. That's Elasticsearch.


🚀TechFromZero Series - ElasticsearchFromZero


🌐 Try it live: https://elasticsearch-from-zero.vercel.app


This isn't a Hello World. It's a real search engine:
📐 React → Express → Elasticsearch 8 → TheMealDB (~300 recipes indexed)


🔗 The full code (with step-by-step commits you can follow):
https://github.com/dev48v/elasticsearch-from-zero


🧱 What I built (step by step):

1️⃣ Monorepo (npm workspaces) — server + client share one repo, deploy independently

2️⃣ Elasticsearch client + cluster-health gate — block boot until ES is yellow, so the API never serves 503s on cold start

3️⃣ Multi-field index mapping — text + keyword + search_as_you_type, all on the same field, each tuned for a different query type

4️⃣ Bulk indexer pulling TheMealDB — concurrent fetch with 8-worker semaphore, batched into 50-doc bulk requests

5️⃣ multi_match with field boosts — name^5, category^2, ingredients^1.5; recipe titles outrank stray ingredient mentions

6️⃣ Autocomplete dropdown via search_as_you_type — debounced 200ms, AbortController cancels stale requests, arrow keys navigate

7️⃣ Faceted filters with terms aggregations — category + cuisine counts update live as you type, URL-synced for shareable searches

8️⃣ Co-located ES + Node Docker on Render free tier — entrypoint.sh boots ES in background, waits for health, seeds index, execs API


💡 Every file has detailed comments explaining WHY, not just what. Written for any beginner who wants to learn Elasticsearch by reading real code — with full clarity on each step.

👉 If you're a beginner learning Elasticsearch, clone it and read the commits one by one. Each commit = one concept. Each file = one lesson. Built from scratch, so nothing is hidden.

🔥 This is Day 30 of a 50-day series. A new technology every day. Follow along!

🌐 See all days: https://dev48v.infy.uk/techfromzero.php

#TechFromZero #Day30 #Elasticsearch #LearnByDoing #OpenSource #BeginnerGuide #100DaysOfCode #CodingFromScratch
