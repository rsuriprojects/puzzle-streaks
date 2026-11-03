# Puzzle Streaks

Tracks your LinkedIn games (Queens, Tango, Zip, Mini Sudoku, Crossclimb, Pinpoint): today's results, your rank among connections, streaks and the last two weeks.

Site: https://rsuriprojects.github.io/puzzle-streaks/

## How logging works

LinkedIn has no public API for game results, so the `extension/` folder is a small Chrome extension. When you finish a game on linkedin.com, it reads the results screen (time or guesses, connection rank, streak) and stores it in your browser. When you open the site, the extension hands the results to the page. Nothing is sent to a server.

## Install the extension

1. Download this repo (Code → Download ZIP) and unzip it.
2. Go to `chrome://extensions` and turn on Developer mode.
3. Click Load unpacked and pick the `extension` folder.

If a game isn't picked up, click the extension icon. It shows the text it saw on the results screen, which is what's needed to fix the parser in `extension/linkedin.js`.
