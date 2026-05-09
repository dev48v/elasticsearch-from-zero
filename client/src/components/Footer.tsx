// Footer back-link — applies the day's theme to a small subtle anchor
// pointing at the dev48v.infy.uk landing page (per Bot 10's footer rule
// from Day 28 forward).
export const Footer = () => (
  <footer className="footer">
    <a href="https://dev48v.infy.uk" target="_blank" rel="noreferrer noopener">
      ← Back to dev48v.infy.uk
    </a>
    <span className="footer-sep">·</span>
    <a
      href="https://github.com/dev48v/elasticsearch-from-zero"
      target="_blank"
      rel="noreferrer noopener"
    >
      View source
    </a>
  </footer>
);
