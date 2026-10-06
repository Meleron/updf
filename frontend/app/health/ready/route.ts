// Not ready without the backend URL: every page would fail.
export function GET() {
  return process.env.BACKEND_URL ? new Response("Healthy") : new Response("BACKEND_URL is not set.", { status: 503 });
}
