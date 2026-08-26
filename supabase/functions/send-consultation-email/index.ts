// Supabase Edge Function: send-consultation-email
// Required secret: RESEND_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sayulaw.co.kr",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char] ?? char));

export default {
  fetch: withSupabase({ auth: "publishable" }, async (request) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    }

    try {
      const { name, phone, message } = await request.json();
      if (![name, phone, message].every((value) => typeof value === "string" && value.trim())) {
        return Response.json({ error: "필수 상담 정보가 없습니다." }, { status: 400, headers: corsHeaders });
      }

      const apiKey = Deno.env.get("RESEND_API_KEY");
      if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

      const submittedAt = new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(new Date());

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "SAYUL 홈페이지 <contact@sayulaw.co.kr>",
          to: ["contact@sayulaw.co.kr"],
          subject: `[SAYUL] 새 상담 신청 · ${name.trim()}`,
          html: `<div style="font-family:Arial,sans-serif;color:#17202d;line-height:1.7"><h2 style="margin:0 0 20px">새 상담 신청</h2><table style="border-collapse:collapse;width:100%;max-width:620px"><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">성명</th><td style="padding:10px;border-bottom:1px solid #ddd">${escapeHtml(name)}</td></tr><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">연락처</th><td style="padding:10px;border-bottom:1px solid #ddd">${escapeHtml(phone)}</td></tr><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">접수 시각</th><td style="padding:10px;border-bottom:1px solid #ddd">${submittedAt}</td></tr><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd;vertical-align:top">상담 내용</th><td style="padding:10px;border-bottom:1px solid #ddd;white-space:pre-wrap">${escapeHtml(message)}</td></tr></table></div>`,
        }),
      });

      if (!emailResponse.ok) throw new Error(await emailResponse.text());
      return Response.json({ ok: true }, { headers: corsHeaders });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "메일 알림 전송에 실패했습니다." }, { status: 500, headers: corsHeaders });
    }
  }),
};