# Live QA repro (fresh browser)

## 1. First-send latency (zz-qa-store-a only)

1. New browser profile (no prior milksha localStorage).
2. Open board: `https://ultronservice.github.io/milksha-demo/?mode=cloud&store=zz-qa-store-a`
3. Open controller: `https://ultronservice.github.io/milksha-demo/controller/?mode=cloud&store=zz-qa-store-a`
4. Wait until controller shows **在線** (connected).
5. Click **送號** once; time until a new number appears on the board (target **≤3s from click**, not from tab open).

Repeat 5 sends; record each click→visible ms.

## 2. 連線暫停 (fresh session)

**Do not** visit zz-qa stores first.

1. New profile.
2. Open: `https://ultronservice.github.io/milksha-demo/?mode=cloud&store=s999999`
3. Expect corner badge **連線暫停** (not **離線**).

## 3. 連線暫停 (existing token — engineer test)

If you already have a zz-qa session, intercept **`boxHeartbeat`** (or Firestore reads) with HTTP 403 `store_not_allowed`. Intercepting **only** `devLogin` will not fire if a valid token remains.
