# Banner Sweeper

A browser extension, backed by a closed-membership service, that declines consent banners and removes overlays that hide content a page has already delivered.

## Language

### What gets removed

**Obstruction**:
Any page element that stands between the reader and content the page has already delivered. Either a Consent Banner or a Content Overlay.
_Avoid_: popup, dialog, content blocker (collides with ad-blocker terminology)

**Consent Banner**:
An Obstruction that asks the visitor to accept or refuse tracking (cookies, storage, data processing).
_Avoid_: cookie popup, cookie dialog, GDPR popup

**CMP**:
A Consent Management Platform: third-party software (OneTrust, Cookiebot, Didomi, …) that renders Consent Banners on many Sites.

**Content Overlay**:
An Obstruction that is not about consent: sign-up nags, meter modals, sticky footers covering text, usually combined with a Scroll Lock.
_Avoid_: content blocker, paywall

**Scroll Lock**:
Page state that prevents scrolling while an Obstruction is shown, typically `overflow: hidden` on `html`/`body`.

**Paywall**:
Content the server withholds and never delivers to the browser. Out of scope: no Rule can recover it.

**Decline**:
To answer a Consent Banner with a refusal, so the Site records that consent was not given.
_Avoid_: reject (fine in UI copy, but Decline is the domain term), close

**Dismiss**:
To make an Obstruction go away without answering it. Acceptable for Content Overlays; never sufficient on its own for a Consent Banner.
_Avoid_: close, hide, remove

### Rules

**Site**:
The hostname (and optionally path) of a top-level page a Rule targets.
_Avoid_: domain, website, page

**Rule**:
A declarative, versioned description of how to Decline or Dismiss the Obstructions on a Site: a Match plus an ordered list of Steps.
_Avoid_: instruction, recipe, script

**Match**:
The part of a Rule that says which top-level pages it applies to. Frames inside a page are targeted per Step, not by the Match.

**Step**:
One generic DOM or storage primitive within a Rule (set a storage key, click, edit an attribute, class or style property, …). Patterns like releasing a Scroll Lock are compositions of Steps, not Steps themselves. Never contains executable code.
_Avoid_: action, instruction, command

**Revision**:
One immutable version of a Rule. Editing a Rule creates a new Revision.

### Rule lifecycle

**Draft**:
A Revision awaiting an Admin's decision, whatever produced it (Detection, Recording, or hand-written).
_Avoid_: proposal, suggestion, pending rule

**Published**:
A Revision that an Admin approved and that Members' extensions apply.
_Avoid_: live, active, approved

**Verification**:
An automated run of a candidate Rule or a Revision against its Site in a headless browser, checking that the Obstruction is gone and the Scroll Lock released. Detection may run it many times while a Rule is being written; only the final run's outcome becomes the Draft's flag.
_Avoid_: test, validation (validation means schema-checking a Rule)

**Verification Report**:
The evidence a Verification produces (before/after screenshots, pass/fail per check) that an Admin reviews alongside a Draft.

**Breakage Report**:
A signal from a Member's extension that a Published Rule ran but the Obstruction is still present.
_Avoid_: bug report, failure

### Producing Drafts

**Detection**:
AI-driven generation of a Draft for a Site, from either a headless visit or a Capture.
_Avoid_: AI feature, auto-detect, AI tool

**Covered**:
A Site whose Consent Banner existing Rules (Bundled or Published) already Decline; Detection then produces no Draft. Rules that only hide the banner don't make a Site Covered.
_Avoid_: already handled, supported

**Capture**:
A sanitised snapshot (DOM + screenshot) of a page as a Member sees it, sent for Detection when a headless visit cannot reproduce the Obstruction.

**Recording**:
A Draft derived from a Member manually Declining or Dismissing an Obstruction: a Storage Diff plus the clicks they made.

**Storage Diff**:
The changes to localStorage and cookies between the moment before and after a Member's manual interaction, minus noise (analytics IDs, timestamps).

### People

**Member**:
An invited, accepted user. Can sync Rules, request Detection, and submit Recordings.
_Avoid_: user, account, client

**Admin**:
A Member who can publish or reject Drafts, edit Rules, and issue Invitations.

**Invitation**:
The only way to become a Member; there is no open registration.
