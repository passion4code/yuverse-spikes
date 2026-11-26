# yuverse-spikes

Rendering prototypes for Yuverse. Project context, decisions and open questions live in
`passion4code/yuverse-shared-context`. Read its `STATUS.md` and `docs/open-questions.md`
(Q14, Q15) before changing direction here, and record results there as session notes or ADRs.

- Spikes are throwaway. Optimise for answering the question fast, not for reuse.
- Each spike is a Vite page: `<name>/index.html` + `src/<name>/`, registered in `vite.config.js`.
- Pin dependency versions exactly. Keep everything a static site so Netlify can host it.
- Headless Chromium here renders with SwiftShader (software), so its fps numbers are meaningless.
  Use it only to check for errors and take screenshots. Real numbers come from devices.
