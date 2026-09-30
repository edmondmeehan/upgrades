const LINKS = [
  ["Terms & Conditions", "https://please.co/pages/terms-and-conditions"],
  ["Privacy Policy", "https://please.co/pages/privacy-policy"],
  ["Purchase Policy", "https://please.co/pages/purchase-policy"],
  ["AdChoices", "https://please.co/pages/ad-choices"],
  ["Help", "https://help.please.co"],
];

export function SiteFooter() {
  return (
    <footer className="site-footer onDark">
      <div className="site-footer-in">
        <p className="site-footer-from">
          Upgrades is a product from your friends at <a href="https://please.co" target="_blank" rel="noopener noreferrer">Please &amp; Thank You</a>.
          {" "}© {new Date().getFullYear()} Please &amp; Thank You. All Rights Reserved.
        </p>
        <nav aria-label="Legal">
          <ul>{LINKS.map(([label, href]) => <li key={href}><a href={href} target="_blank" rel="noopener noreferrer">{label}</a></li>)}</ul>
        </nav>
      </div>
    </footer>
  );
}
