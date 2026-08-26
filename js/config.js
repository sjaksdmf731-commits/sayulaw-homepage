// 법률사무소 사율 CMS - Supabase 연결 설정
// 이 파일을 /js/config.js 로 저장해서 사용하세요.
//
// 1) Supabase Connect 화면의 Project URL을 SAYUL_SUPABASE_URL에 넣습니다.
// 2) Supabase Connect 화면의 Publishable key를 SAYUL_SUPABASE_PUBLISHABLE_KEY에 넣습니다.
// 3) sb_secret_... / service_role 키는 절대 넣지 마세요.
//
// 예:
// window.SAYUL_SUPABASE_URL = "https://xxxxxxxx.supabase.co";
// window.SAYUL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xxxxxxxxx";

window.SAYUL_SUPABASE_URL = "https://ldrkdcjffuiaaomeugfs.supabase.co";
window.SAYUL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tT_NOgnCX1iTU2y0Ye2B_A_Z8yfLG5p";

export function getConfig() {
  return {
    url: window.SAYUL_SUPABASE_URL,
    key: window.SAYUL_SUPABASE_PUBLISHABLE_KEY
  };
}
