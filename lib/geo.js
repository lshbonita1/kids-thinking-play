// IP 기반 지역 추정 (뉴스런 lib/geo.js와 같은 방식)

// 통계에서 뺄 IP (운영자 집 · 사무실 등). 공개 저장소라 코드에 적지 않고 Vercel 환경 변수로 받음
// 예: EXCLUDED_VISIT_IPS = "1.2.3.4,5.6.7.8"
export const EXCLUDED_VISIT_IPS = String(process.env.EXCLUDED_VISIT_IPS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

// 클라우드/크롤러성 IP(사람이 아니라 봇·링크 미리보기 생성기일 확률이 높음) 판별용 키워드.
// isp/org 둘 중 하나라도 일치하면 지역 통계에서 뺌
const BOT_ISP_KEYWORDS = [
  'tencent', 'facebook', 'amazon', 'aws', 'google cloud', 'google llc',
  'microsoft', 'azure', 'alibaba', 'digitalocean', 'ovh', 'cloudflare',
  'linode', 'hetzner', 'oracle cloud', 'akamai', 'fastly', 'bytedance',
  'china unicom', 'cnc group', 'china169', 'china telecom', 'china mobile', 'vercel',
];
export function looksLikeBotIsp(geo) {
  if (!geo) return false;
  const text = `${geo.isp || ''} ${geo.org || ''}`.toLowerCase();
  return BOT_ISP_KEYWORDS.some((k) => text.includes(k));
}

// ip-api.com의 city 값은 로마자라 자주 나오는 곳만 한글로 바꿈 (서울 25개구 + 주요 시)
export const CITY_NAME_KO = {
  'Gangnam-gu': '강남구', 'Gangdong-gu': '강동구', 'Gangbuk-gu': '강북구', 'Gangseo-gu': '강서구',
  'Gwanak-gu': '관악구', 'Gwangjin-gu': '광진구', 'Guro-gu': '구로구', 'Geumcheon-gu': '금천구',
  'Nowon-gu': '노원구', 'Dobong-gu': '도봉구', 'Dongdaemun-gu': '동대문구', 'Dongjak-gu': '동작구',
  'Mapo-gu': '마포구', 'Seodaemun-gu': '서대문구', 'Seocho-gu': '서초구', 'Seongdong-gu': '성동구',
  'Seongbuk-gu': '성북구', 'Songpa-gu': '송파구', 'Yangcheon-gu': '양천구', 'Yeongdeungpo-gu': '영등포구',
  'Yongsan-gu': '용산구', 'Eunpyeong-gu': '은평구', 'Jongno-gu': '종로구', 'Jungnang-gu': '중랑구',
  'Suwon-si': '수원시', 'Seongnam-si': '성남시', 'Goyang-si': '고양시', 'Yongin-si': '용인시',
  'Bucheon-si': '부천시', 'Ansan-si': '안산시', 'Anyang-si': '안양시', 'Namyangju-si': '남양주시',
  'Hwaseong-si': '화성시', 'Pyeongtaek-si': '평택시', 'Uijeongbu-si': '의정부시', 'Siheung-si': '시흥시',
  'Paju-si': '파주시', 'Gimpo-si': '김포시', 'Gwangmyeong-si': '광명시', 'Gunpo-si': '군포시',
  'Icheon-si': '이천시', 'Yangju-si': '양주시', 'Osan-si': '오산시', 'Guri-si': '구리시',
  'Anseong-si': '안성시', 'Pocheon-si': '포천시', 'Uiwang-si': '의왕시', 'Hanam-si': '하남시',
  'Yeoju-si': '여주시', 'Chuncheon': '춘천시', 'Cheonan': '천안시', 'Seoul': '서울', 'Busan': '부산',
  'Incheon': '인천', 'Daegu': '대구', 'Daejeon': '대전', 'Gwangju': '광주', 'Ulsan': '울산', 'Sejong': '세종',
};

// ip-api.com 무료 배치 조회(최대 100개/회, 키 불필요). 실패해도 통계 전체가 깨지지 않게 빈 객체로
async function fetchIpGeoBatch(ips) {
  try {
    const resp = await fetch('http://ip-api.com/batch?fields=status,country,countryCode,regionName,city,isp,org,query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ips),
    });
    if (!resp.ok) return {};
    const byIp = {};
    for (const r of await resp.json()) {
      if (r.status !== 'success') continue;
      byIp[r.query] = {
        country: r.country || '', countryCode: r.countryCode || '', region: r.regionName || '',
        city: r.city || '', isp: r.isp || '', org: r.org || '',
      };
    }
    return byIp;
  } catch {
    return {};
  }
}

// 100개씩 나눠 조회 (무료 한도 분당 45회보다 훨씬 적게 부름)
export async function fetchIpGeo(ips) {
  if (!ips.length) return {};
  const chunks = [];
  for (let i = 0; i < ips.length; i += 100) chunks.push(ips.slice(i, i + 100));
  return Object.assign({}, ...(await Promise.all(chunks.map(fetchIpGeoBatch))));
}
