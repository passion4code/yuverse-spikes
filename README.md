# Yuverse spikes

Throwaway rendering prototypes for [Yuverse](https://github.com/passion4code/yuverse-shared-context).
Each spike tests one question about how the Yuverse looks and how fast it runs on real phones,
tablets and PCs. They're for learning, not production code.

## Spikes

| Path | Question | Stack |
|---|---|---|
| `/yuhome/` | Can a stylized Yuhome scale from one cottage to ~20,000 buildings with walking Yusians and stay smooth on a phone? | Three.js 0.170 (WebGL 2), instancing, toon shading, inverted-hull outlines |

Every spike has a **Run benchmark** button. It measures each scene size for 5 seconds and gives
a text summary (average fps, slowest 1%, device and GPU) to paste back into the project.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Deploy

Netlify builds from `netlify.toml`: `npm run build`, publish `dist/`, Node 22. Import the repo in
Netlify and it deploys every push to `main`, with a preview for each pull request.

## Adding a spike

1. Add `<name>/index.html` and `src/<name>/`.
2. Add the HTML entry to `vite.config.js` and a card to the root `index.html`.
3. Give it a benchmark that outputs copyable text, like the Yuhome spike.
