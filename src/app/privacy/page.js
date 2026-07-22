import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — FORCE PULSE",
  description: "Privacy Policy for the FORCE PULSE tournament scoring app.",
};

const updated = "22 July 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-cream-bg text-deep-forest font-sans">
      <header className="pitch-stripes border-b-4 border-mustard-gold/80 safe-pad-top">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-mustard-gold font-mono text-[10px] font-bold uppercase tracking-widest mb-4"
          >
            ← FORCE PULSE
          </Link>
          <h1 className="text-3xl sm:text-4xl font-display uppercase text-white drop-shadow">
            Privacy Policy
          </h1>
          <p className="text-sm text-white/75 mt-2 font-medium">
            Last updated: {updated}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-8 text-sm leading-relaxed text-deep-forest/90">
        <section className="space-y-3">
          <p>
            FORCE PULSE (“we”, “our”, or “the App”) is a tournament scoring and
            live board service available on the web and as an Android app. This
            Privacy Policy explains what information we collect, how we use it,
            and your choices.
          </p>
          <p>
            By using FORCE PULSE, you agree to this policy. If you do not agree,
            please do not use the App.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            1. Who this applies to
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Public visitors / fans</strong> — can view tournaments and
              live boards without creating an account.
            </li>
            <li>
              <strong>Organizers and managers</strong> — sign in with email and
              password to create tournaments, manage clubs/players, schedule
              matches, and score games.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            2. Information we collect
          </h2>
          <h3 className="font-bold text-deep-forest">Account information</h3>
          <p>
            When an organizer or manager account is created, we store name,
            email address, role (admin or manager), and a securely hashed
            password. We do not store passwords in plain text.
          </p>
          <h3 className="font-bold text-deep-forest pt-2">Tournament content</h3>
          <p>
            Organizers may upload or enter tournament names, dates, logos,
            categories, club/team names, player names, shirt numbers, photos or
            logos, schedules, scores, match events, and related awards. This
            content may be shown on public live boards.
          </p>
          <h3 className="font-bold text-deep-forest pt-2">
            Device and technical data
          </h3>
          <p>
            Like most online services, our servers and hosting providers may
            automatically receive technical data such as IP address, browser or
            app type, device type, and request timestamps. We use this for
            security, reliability, and debugging.
          </p>
          <h3 className="font-bold text-deep-forest pt-2">Local device storage</h3>
          <p>
            The App may store small preferences on your device (for example,
            selected category on a live board) using browser or app local
            storage. Session cookies may be used to keep organizers signed in.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            3. How we use information
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide live scoring, standings, and public tournament boards</li>
            <li>Authenticate organizers and managers and enforce access control</li>
            <li>Store and display tournament, club, and player information you enter</li>
            <li>Operate, secure, and improve the App and its infrastructure</li>
            <li>Respond to support requests</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your personal information. We do not
            use your data for third-party advertising.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            4. Sharing and service providers
          </h2>
          <p>
            We use trusted infrastructure providers to run the App, which may
            include:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Hosting and deployment (e.g. Vercel)</li>
            <li>Database and file storage / realtime services (e.g. Supabase)</li>
            <li>Android distribution via Google Play</li>
          </ul>
          <p>
            These providers process data only to help us deliver the service,
            under their own privacy terms and security practices. Tournament
            content that organizers mark as public (such as live boards) is
            visible to anyone with the link or app access.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            5. Children
          </h2>
          <p>
            FORCE PULSE is intended for tournament organizers and general sports
            audiences. It is not directed at children under 13. If you believe we
            have collected personal information from a child under 13, contact us
            and we will delete it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            6. Data retention
          </h2>
          <p>
            We keep account and tournament data while your account and
            tournaments remain active, or as needed to operate the service and
            meet legal obligations. Organizers may request deletion of accounts
            or tournament data by contacting us.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            7. Security
          </h2>
          <p>
            We use reasonable technical measures such as hashed passwords,
            HTTPS, and access-controlled organizer sessions. No method of
            transmission or storage is 100% secure; please use a strong unique
            password for organizer accounts.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            8. Your choices
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Fans can use public boards without creating an account</li>
            <li>Organizers can update or delete tournament content they manage</li>
            <li>
              You may request access, correction, or deletion of your account
              data by emailing us
            </li>
            <li>You can sign out of organizer sessions at any time</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            9. International processing
          </h2>
          <p>
            Our hosting and database providers may process data in data centers
            outside your country. By using the App, you understand that your
            information may be transferred and stored in those locations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            10. Changes to this policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. The “Last
            updated” date at the top will change when we do. Continued use of
            the App after changes means you accept the updated policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-deep-forest/60">
            11. Contact
          </h2>
          <p>
            For privacy questions or data requests, contact:
          </p>
          <p>
            <a
              href="mailto:ritikyadav10888@gmail.com"
              className="text-mustard-gold-hover font-mono font-bold underline"
            >
              ritikyadav10888@gmail.com
            </a>
          </p>
          <p className="text-deep-forest/70">
            App: FORCE PULSE · Website:{" "}
            <a
              href="https://forcepulse.vercel.app"
              className="underline"
            >
              https://forcepulse.vercel.app
            </a>
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 safe-pad-bottom">
        <div className="max-w-3xl mx-auto px-4 text-center text-[10px] font-mono text-slate-400 space-x-3">
          <Link href="/" className="hover:text-deep-forest">
            Home
          </Link>
          <span>·</span>
          <Link href="/admin" className="hover:text-deep-forest">
            Organizer login
          </Link>
          <span>·</span>
          <span>© 2026 FORCE PULSE</span>
        </div>
      </footer>
    </div>
  );
}
