const firebaseConfig = {
  apiKey: "AIzaSyA8C-buV2nNNodP4c44RA3C25Y_ae-jjxA",
  authDomain: "pickitems-662af.firebaseapp.com",
  databaseURL: "https://pickitems-662af-default-rtdb.firebaseio.com",
  projectId: "pickitems-662af",
  storageBucket: "pickitems-662af.firebasestorage.app",
  messagingSenderId: "161331059412",
  appId: "1:161331059412:web:080bbd57e3187803fff941"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================
// 🔥 공통 경로
// ==========================
const PATH = {
  GAME: "game",
  CONFIG: "config",
  STUDENTS: "students",
  ITEMS: "items"
};

// ==========================
// 🎮 게임 상태
// ==========================
const GAME_STATE = {
  WAIT: "WAIT",
  OPEN: "OPEN",
  END: "END"
};

// ==========================
// 🧑 학생 상태
// ==========================
const STUDENT_STATE = {
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
  DONE: "DONE"
};

// ==========================
// 🔐 인증 문제/정답 기본값
// ==========================
const DEFAULT_AUTH_QUESTION = "신청을 확정하려면 아래 단어를 입력하세요.";
const DEFAULT_AUTH_WORD = "신청확정";

// ==========================
// 🧠 설정(config) 기본값
// - selectionMode: "single"(한 개만 선택) | "multi"(여러 개 선택)
// - maxSelections: multi 모드일 때 1인당 최대 선택 개수
// ==========================
function getInitialConfig() {
  return {
    studentCount: 29,
    selectionMode: "single",
    maxSelections: 1,
    authQuestion: DEFAULT_AUTH_QUESTION,
    authWord: DEFAULT_AUTH_WORD
  };
}

// ==========================
// 🧠 게임 상태 기본값
// ==========================
function getInitialGame(adminPassword) {
  return {
    state: GAME_STATE.WAIT,
    adminPassword: adminPassword || "1234"
  };
}

// ==========================
// 🧑 학생 데이터 생성 함수 (1 ~ studentCount)
// ==========================
function generateStudents(studentCount) {
  const students = {};
  for (let i = 1; i <= studentCount; i++) {
    students[i] = {
      password: String(1000 + i),
      status: STUDENT_STATE.OFFLINE,
      selections: {}
    };
  }
  return students;
}

// ==========================
// 🆔 항목 고유 id 생성 (개별 추가 시 충돌 방지용)
// ==========================
function generateItemId() {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ==========================
// 🧩 항목 배열 → Firebase 저장용 객체로 변환
// items: [{ name, capacity }, ...]
// ==========================
function buildItemsObject(items) {
  const obj = {};
  items.forEach((item) => {
    obj[generateItemId()] = {
      name: item.name,
      capacity: item.capacity,
      participants: {}
    };
  });
  return obj;
}

// ==========================
// ✅ 항목 목록 검증
// - 배열이 비어있지 않아야 함
// - 이름이 비어있지 않아야 하고, 중복되면 안 됨
// - 정원은 1 이상의 정수여야 함
// 문제 있으면 에러 메시지 문자열 반환, 없으면 null
// ==========================
function validateItemsList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "항목을 한 개 이상 등록하세요.";
  }

  const seenNames = new Set();
  for (const item of items) {
    const name = (item.name || "").trim();
    if (!name) {
      return "항목 이름이 비어있는 줄이 있습니다.";
    }
    if (seenNames.has(name)) {
      return `항목 이름이 중복되었습니다: ${name}`;
    }
    seenNames.add(name);

    const capacity = parseInt(item.capacity, 10);
    if (isNaN(capacity) || capacity < 1) {
      return `"${name}" 항목의 정원은 1 이상의 숫자여야 합니다.`;
    }
  }
  return null;
}

// ==========================
// 📋 "이름,정원" 형식의 텍스트를 파싱
// - 한 줄에 하나씩, 콤마로 구분
// - 반환값: { items: [{name, capacity}], errors: ["3행 형식 오류", ...] }
// ==========================
function parseItemsBulkText(text) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const items = [];
  const errors = [];

  lines.forEach((line, idx) => {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length !== 2) {
      errors.push(`${idx + 1}행 형식 오류 (예: 교실 쓸기,4)`);
      return;
    }
    const [name, capacityStr] = parts;
    const capacity = parseInt(capacityStr, 10);

    if (!name) {
      errors.push(`${idx + 1}행 이름 없음`);
      return;
    }
    if (isNaN(capacity) || capacity < 1) {
      errors.push(`${idx + 1}행 정원 오류(${capacityStr})`);
      return;
    }

    items.push({ name, capacity });
  });

  return { items, errors };
}

// ==========================
// 🔐 인증 단어 검증
// ==========================
function checkCaptcha(input, real) {
  return input.trim() === real;
}

// ==========================
// ⏱ sleep (UI용)
// ==========================
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}