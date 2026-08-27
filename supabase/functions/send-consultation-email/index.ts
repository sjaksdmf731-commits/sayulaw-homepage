// Supabase Edge Function: secure consultation submission and email notification
// Required secret: RESEND_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://sayulaw.co.kr",
  "https://www.sayulaw.co.kr",
]);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://sayulaw.co.kr",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (
  request: Request,
  body: Record<string, unknown>,
  status = 200,
) =>
  Response.json(body, {
    status,
    headers: corsHeaders(request),
  });

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char] ?? char));

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed" }, 405);
  }

  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigins.has(origin)) {
    return json(request, { error: "허용되지 않은 요청입니다." }, 403);
  }

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !phone || !message) {
      return json(request, { error: "필수 상담 정보가 없습니다." }, 400);
    }
    if (name.length > 40 || phone.length > 30 || message.length > 2000) {
      return json(request, { error: "입력 가능한 글자 수를 초과했습니다." }, 400);
    }
    if (!/^[0-9+()\-\s]{7,30}$/.test(phone)) {
      return json(request, { error: "연락처 형식을 확인해주세요." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase server credentials are not configured.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ipHash = await sha256(getClientIp(request));
    const requestHash = await sha256(
      [ipHash, name, phone.replace(/\s/g, ""), message].join("|"),
    );

    const { data: limitResult, error: limitError } = await admin.rpc(
      "check_consultation_rate_limit",
      {
        p_ip_hash: ipHash,
        p_request_hash: requestHash,
      },
    );

    if (limitError) throw limitError;

    const decision = Array.isArray(limitResult) ? limitResult[0] : limitResult;
    if (!decision?.allowed) {
      const duplicate = decision?.reason === "duplicate";
      return json(
        request,
        {
          error: duplicate
            ? "이미 접수 중인 동일한 상담 신청입니다."
            : "요청이 많습니다. 10분 후 다시 시도해주세요.",
          code: decision?.reason ?? "rate_limit",
        },
        429,
      );
    }

    const { error: insertError } = await admin.from("inquiries").insert({
      name,
      phone,
      message,
      privacy_consent: true,
      consent_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

    const submittedAt = new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }).format(new Date());

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SAYUL 홈페이지 <contact@sayulaw.co.kr>",
        to: ["contact@sayulaw.co.kr"],
        subject: `[SAYUL] 새 상담 신청 · ${name}`,
        html: `<div style="font-family:Arial,sans-serif;color:#17202d;line-height:1.7"><h2 style="margin:0 0 20px">새 상담 신청</h2><table style="border-collapse:collapse;width:100%;max-width:620px"><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">성명</th><td style="padding:10px;border-bottom:1px solid #ddd">${escapeHtml(name)}</td></tr><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">연락처</th><td style="padding:10px;border-bottom:1px solid #ddd">${escapeHtml(phone)}</td></tr><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">접수 시각</th><td style="padding:10px;border-bottom:1px solid #ddd">${submittedAt}</td></tr><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd;vertical-align:top">상담 내용</th><td style="padding:10px;border-bottom:1px solid #ddd;white-space:pre-wrap">${escapeHtml(message)}</td></tr></table></div>`,
      }),
    });

    if (!emailResponse.ok) {
      console.error("Email notification failed:", await emailResponse.text());
      return json(request, { ok: true, email_sent: false });
    }

    return json(request, { ok: true, email_sent: true });
  } catch (error) {
    console.error(error);
    return json(
      request,
      { error: "상담 신청 처리에 실패했습니다." },
      500,
    );
  }
});
