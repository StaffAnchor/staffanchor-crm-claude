// Emails that only tell our own staff something internal (assignment notices,
// reminder digests). They are OFF by default: staff already get the same
// events as in-app notifications, and the only emails worth an inbox are the
// ones where a client is waiting on us. Set ENABLE_INTERNAL_EMAILS=true to
// turn them back on.
export const internalEmailsEnabled = () => process.env.ENABLE_INTERNAL_EMAILS === "true";
