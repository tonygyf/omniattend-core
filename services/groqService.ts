/**
 * Service for interacting with the Groq API via the Cloudflare Worker proxy.
 */

/**
 * Generates attendance insights by sending statistical data to the backend worker,
 * which then queries the Groq API.
 * @param stats - The attendance statistics object.
 * @returns The AI-generated insight string.
 */
export async function generateAttendanceInsights(
  stats: any,
  students: any[]
): Promise<string> {
  const res = await fetch("/api/insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      stats, 
      students 
    }),
  });

  if (!res.ok) {
    // Create a new error object that includes the status code
    const error: any = new Error(
      `API Error: ${await res.text() || res.statusText}`
    );
    error.status = res.status;
    throw error;
  }

  const data: { result: string } = await res.json();
  return data.result;
}