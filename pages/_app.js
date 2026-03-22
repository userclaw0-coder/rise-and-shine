import Head from "next/head";
import "../styles/globals.css";
import { absoluteUrl, getSiteOrigin } from "../lib/siteUrl";

const DEFAULT_TITLE = "Rise & Shine — The mindful curator";
const DEFAULT_DESCRIPTION =
  "Intentional daily planning: life vision, backlog, your Next 3 actions, and calm AI guidance.";

export default function App({ Component, pageProps }) {
  const siteOrigin = getSiteOrigin();
  const ogImageAbsolute = siteOrigin ? absoluteUrl("/og-image.png") : "";

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{DEFAULT_TITLE}</title>
        <meta name="description" content={DEFAULT_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Rise & Shine" />
        <meta property="og:title" content={DEFAULT_TITLE} />
        <meta property="og:description" content={DEFAULT_DESCRIPTION} />
        {ogImageAbsolute ? (
          <>
            <meta property="og:image" content={ogImageAbsolute} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:image" content={ogImageAbsolute} />
          </>
        ) : (
          <meta name="twitter:card" content="summary" />
        )}
        <meta name="twitter:title" content={DEFAULT_TITLE} />
        <meta name="twitter:description" content={DEFAULT_DESCRIPTION} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Manrope:wght@500;600;700;800&family=Work+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
