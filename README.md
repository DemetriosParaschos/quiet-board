# Quiet Board

Quiet Board converts PGN chess games into clean, printable PDF study documents, entirely within the browser.

Use the public application at [demetriosparaschos.github.io/quiet-board/](https://demetriosparaschos.github.io/quiet-board/).

## Features

- Paste PGN text or upload a `.pgn` file, up to 512 KB.
- Import multiple games, with up to 50 games per export.
- Support custom FEN starting positions.
- Choose between all-moves, Play as White, and Play as Black study modes.
- Select White at bottom or Black at bottom board orientation.
- Include optional comments, move history, player names, and game metadata such as event, date, round, result, and ECO.
- Choose A4 or US Letter paper and one, two, or four positions per page.
- Add an optional front cover and back cover, enabled by default.
- Preview and download printable PDFs.

Variations are ignored and legal moves are validated locally. Comments remain associated with their corresponding positions.

## Privacy

PGN text and selected files are processed locally in the browser. Quiet Board does not upload PGN data to a server.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

To build and preview the production version locally:

```bash
npm run build
npm run preview
```

Run the test suite with:

```bash
npm test
```

## Deployment

Quiet Board is a static Vite site and is compatible with GitHub Pages. In the repository settings, choose **GitHub Actions** as the Pages source. Pushing to `main`, or running the workflow manually, builds and deploys the site using [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).

## Support

If you find Quiet Board useful, you can [support its development](https://paypal.me/demparaschos).

## Licence

Quiet Board is released under the [Unlicense](LICENSE). See [PHILOSOPHY.md](PHILOSOPHY.md) for the author's position on intellectual property.
