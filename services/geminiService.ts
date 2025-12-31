import { GoogleGenAI } from "@google/genai";
import { DashboardStats, AttendanceRecord } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key not found in environment variables");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateAttendanceInsights = async (
  stats: DashboardStats,
  recentRecords: AttendanceRecord[]
): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Error: API Key missing. Unable to generate insights.";

  const prompt = `
    Analyze the following attendance data for a corporate environment "FaceCheck".
    
    Current Stats:
    - Total Users: ${stats.totalUsers}
    - Present Today: ${stats.presentToday}
    - Late Today: ${stats.lateToday}
    - Absent Today: ${stats.absentToday}
    
    Recent Check-ins Sample:
    ${JSON.stringify(recentRecords.map(r => ({ user: r.userName, time: r.timestamp, status: r.status, confidence: r.confidenceScore })))}

    Please provide a concise, executive summary of the attendance health.
    1. Identify any concerning trends (e.g., high lateness).
    2. Comment on the system confidence scores (FaceCheck reliability).
    3. Suggest one actionable improvement for the admin.
    
    Keep the tone professional and helpful. Format with clear headers or bullet points.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "No insights generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Unable to generate insights at this time. Please check your API configuration.";
  }
};
