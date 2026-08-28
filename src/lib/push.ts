import webpush from "web-push";

let configured = false;

// Deferred until first use so importing this module (e.g. during `next
// build`'s route data collection) never touches process.env - the VAPID
// keys are only required at actual request time, which lets them be
// supplied purely as container runtime env vars.
export function getWebPush() {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return webpush;
}
