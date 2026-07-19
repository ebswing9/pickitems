/* =========================
   전역 상태
========================= */
let currentConfig = null;
let cachedItems = {};
let cachedStudents = {};

/* =========================
   관리자 로그인
========================= */
document.getElementById("btn-admin-login").addEventListener("click", async () => {
    const pw = document.getElementById("admin-pw").value;
    const error = document.getElementById("admin-login-error");
    error.innerText = "";

    const snap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
    const realPw = snap.val();

    if (!realPw) {
        error.innerText = "관리자 비밀번호가 설정되지 않았습니다.";
        return;
    }
    if (pw !== realPw) {
        error.innerText = "비밀번호가 틀렸습니다.";
        return;
    }

    localStorage.setItem("isAdmin", "true");

    document.getElementById("admin-login-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");

    initAdmin();
});

/* =========================
   관리자 로그아웃
========================= */
function adminLogout() {
    localStorage.removeItem("isAdmin");
    document.getElementById("admin-view").classList.add("hidden");
    document.getElementById("admin-login-view").classList.remove("hidden");
    document.getElementById("admin-pw").value = "";
}

document.getElementById("btn-admin-logout")?.addEventListener("click", adminLogout);

/* =========================
   자동 로그인 (새로고침 대응)
========================= */
window.addEventListener("load", () => {
    if (localStorage.getItem("isAdmin") === "true") {
        document.getElementById("admin-login-view").classList.add("hidden");
        document.getElementById("admin-view").classList.remove("hidden");
        initAdmin();
    }
});

/* =========================
   관리자 초기화
========================= */
async function initAdmin() {
    await ensureConfigExists();
    listenConfig();
    listenStudents();
    listenItems();
    listenGame();
    setupModeUI();
}

async function ensureConfigExists() {
    const snap = await db.ref(`${PATH.CONFIG}`).once("value");
    if (!snap.val()) {
        await db.ref(`${PATH.CONFIG}`).set(getInitialConfig());
    }
}

/* =========================
   설정(config) 실시간 감시
========================= */
function listenConfig() {
    db.ref(`${PATH.CONFIG}`).on("value", (snap) => {
        currentConfig = snap.val();
        if (!currentConfig) return;

        updateModeInputsFromConfig();
        updateAuthInputsFromConfig();
        updateStudentCountInputFromConfig();
        updateConnectCountLabel();
    });
}

/* =========================
   학생 수 설정 및 명단 생성
========================= */
function updateStudentCountInputFromConfig() {
    const input = document.getElementById("student-count-input");
    if (document.activeElement !== input) {
        input.value = currentConfig.studentCount || 29;
    }
}

document.getElementById("btn-generate-students").addEventListener("click", async () => {
    const status = document.getElementById("student-count-status");
    const studentCount = parseInt(document.getElementById("student-count-input").value, 10);

    if (!studentCount || studentCount < 1) {
        status.innerText = "학생 수는 1 이상이어야 합니다.";
        return;
    }

    // 1. config에 학생 수 저장
    await db.ref(`${PATH.CONFIG}/studentCount`).set(studentCount);

    // 2. 기존 학생은 비밀번호 유지, 새로 늘어난 번호만 추가 생성
    const studentsSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const existingStudents = studentsSnap.val() || {};
    const additions = {};
    for (let i = 1; i <= studentCount; i++) {
        if (!existingStudents[i]) {
            additions[`${PATH.STUDENTS}/${i}`] = {
                password: String(1000 + i),
                status: STUDENT_STATE.OFFLINE,
                selections: {}
            };
        }
    }

    if (Object.keys(additions).length > 0) {
        await db.ref().update(additions);
        status.innerText = `✅ 총 ${studentCount}명으로 설정, ${Object.keys(additions).length}명 신규 생성됨`;
    } else {
        status.innerText = `✅ 총 ${studentCount}명 (변경 없음, 이미 모두 존재함)`;
    }
});

/* =========================
   선택 방식(단일/다중) 설정 UI
========================= */
function setupModeUI() {
    document.getElementById("selection-mode-select").addEventListener("change", (e) => {
        document.getElementById("max-selections-row").style.display =
            e.target.value === "multi" ? "block" : "none";
    });
}

function updateModeInputsFromConfig() {
    const modeSelect = document.getElementById("selection-mode-select");
    const maxInput = document.getElementById("max-selections-input");

    if (document.activeElement !== modeSelect) {
        modeSelect.value = currentConfig.selectionMode || "single";
    }
    if (document.activeElement !== maxInput) {
        maxInput.value = currentConfig.maxSelections || 1;
    }

    document.getElementById("max-selections-row").style.display =
        modeSelect.value === "multi" ? "block" : "none";
}

document.getElementById("btn-save-mode").addEventListener("click", async () => {
    const mode = document.getElementById("selection-mode-select").value;
    const maxSelections = parseInt(document.getElementById("max-selections-input").value, 10) || 1;

    await db.ref(`${PATH.CONFIG}`).update({
        selectionMode: mode,
        maxSelections: mode === "multi" ? maxSelections : 1
    });

    alert("선택 방식이 저장되었습니다.");
});

/* =========================
   항목 관리
========================= */
function listenItems() {
    db.ref(`${PATH.ITEMS}`).on("value", (snap) => {
        cachedItems = snap.val() || {};
        renderItemsAdminList();
        renderItemsStatusList();
    });
}

// 관리자 패널의 "현재 등록된 항목" 목록 (삭제 가능)
function renderItemsAdminList() {
    const container = document.getElementById("items-admin-list");
    container.innerHTML = "";

    const ids = Object.keys(cachedItems);
    if (ids.length === 0) {
        container.innerHTML = `<p class="hint-text">등록된 항목이 없습니다.</p>`;
        return;
    }

    ids.forEach(itemId => {
        const item = cachedItems[itemId];
        const count = item.participants ? Object.keys(item.participants).length : 0;

        const row = document.createElement("div");
        row.className = "student-row";

        const nameSpan = document.createElement("span");
        nameSpan.innerText = `${item.name} (${count}/${item.capacity}명)`;

        const delBtn = document.createElement("button");
        delBtn.className = "secondary";
        delBtn.style.width = "auto";
        delBtn.style.margin = "0";
        delBtn.style.padding = "4px 10px";
        delBtn.innerText = "삭제";
        delBtn.addEventListener("click", () => deleteItem(itemId));

        row.appendChild(nameSpan);
        row.appendChild(delBtn);
        container.appendChild(row);
    });
}

async function deleteItem(itemId) {
    const item = cachedItems[itemId];
    const ok = confirm(`"${item.name}" 항목을 삭제하시겠습니까?\n이 항목을 신청한 학생의 신청 내역도 함께 삭제됩니다.`);
    if (!ok) return;

    // 이 항목을 신청한 학생들의 selections에서도 제거
    const studentsSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const students = studentsSnap.val() || {};
    const updates = {};
    for (const id in students) {
        if (students[id].selections && students[id].selections[itemId]) {
            updates[`${PATH.STUDENTS}/${id}/selections/${itemId}`] = null;
        }
    }
    updates[`${PATH.ITEMS}/${itemId}`] = null;

    await db.ref().update(updates);
}

document.getElementById("btn-add-item").addEventListener("click", async () => {
    const name = document.getElementById("new-item-name").value.trim();
    const capacity = parseInt(document.getElementById("new-item-capacity").value, 10);
    const status = document.getElementById("items-status");

    if (!name) {
        status.innerText = "항목 이름을 입력하세요.";
        return;
    }
    if (isNaN(capacity) || capacity < 1) {
        status.innerText = "정원은 1 이상의 숫자여야 합니다.";
        return;
    }

    const existingNames = Object.values(cachedItems).map(i => i.name);
    if (existingNames.includes(name)) {
        status.innerText = "이미 존재하는 항목 이름입니다.";
        return;
    }

    const itemId = generateItemId();
    await db.ref(`${PATH.ITEMS}/${itemId}`).set({
        name,
        capacity,
        participants: {}
    });

    document.getElementById("new-item-name").value = "";
    document.getElementById("new-item-capacity").value = "";
    status.innerText = "";
});

document.getElementById("btn-bulk-register").addEventListener("click", async () => {
    const text = document.getElementById("bulk-items-text").value;
    const status = document.getElementById("items-status");
    const { items, errors } = parseItemsBulkText(text);

    if (errors.length > 0) {
        status.innerText = `⚠️ 오류: ${errors.join(", ")}`;
        return;
    }

    const validationError = validateItemsList(items);
    if (validationError) {
        status.innerText = validationError;
        return;
    }

    const ok = confirm(
        `일괄 등록하면 기존에 등록된 항목이 모두 삭제되고,\n` +
        `학생들의 신청 내역도 모두 초기화됩니다.\n계속하시겠습니까?`
    );
    if (!ok) return;

    const newItems = buildItemsObject(items);

    // 항목 전체 교체 + 모든 학생의 selections/status 초기화
    const studentsSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const students = studentsSnap.val() || {};
    const updates = {};
    for (const id in students) {
        updates[`${PATH.STUDENTS}/${id}/selections`] = {};
        updates[`${PATH.STUDENTS}/${id}/status`] = STUDENT_STATE.OFFLINE;
    }
    updates[`${PATH.ITEMS}`] = newItems;

    await db.ref().update(updates);

    document.getElementById("bulk-items-text").value = "";
    status.innerText = "";
    alert("항목이 일괄 등록되었습니다.");
});

/* =========================
   항목별 신청 결과 CSV(엑셀) 다운로드
   - 형식: 항목명, 정원, 신청인원, 신청자 번호 목록(번호순, 세미콜론 구분)
========================= */
document.getElementById("btn-download-results-csv").addEventListener("click", () => {
    const itemIds = Object.keys(cachedItems);

    if (itemIds.length === 0) {
        alert("등록된 항목이 없습니다.");
        return;
    }

    const header = ["항목명", "정원", "신청인원", "신청자 번호"];
    const rows = [header.join(",")];

    itemIds.forEach(itemId => {
        const item = cachedItems[itemId];
        const participantIds = item.participants
            ? Object.keys(item.participants).map(id => parseInt(id, 10)).sort((a, b) => a - b)
            : [];

        // 항목명에 콤마가 들어있을 수 있으니 큰따옴표로 감싸기
        const nameField = `"${(item.name || "").replace(/"/g, '""')}"`;
        const idsField = `"${participantIds.join("; ")}"`;

        rows.push([nameField, item.capacity, participantIds.length, idsField].join(","));
    });

    // 엑셀에서 한글이 깨지지 않도록 BOM 추가
    const csvContent = "\uFEFF" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "신청결과.csv";
    a.click();
    URL.revokeObjectURL(url);
});

/* =========================
   인증 문제 설정
========================= */
function updateAuthInputsFromConfig() {
    const q = document.getElementById("auth-question-admin");
    const w = document.getElementById("auth-word-admin");

    if (document.activeElement !== q) q.value = currentConfig.authQuestion || "";
    if (document.activeElement !== w) w.value = currentConfig.authWord || "";

    document.getElementById("auth-status").innerText = `현재 정답: ${currentConfig.authWord || "-"}`;
    document.getElementById("auth-question-preview").innerText =
        currentConfig.authQuestion || "문제가 여기에 표시됩니다";
}

document.getElementById("btn-set-auth").addEventListener("click", async () => {
    const question = document.getElementById("auth-question-admin").value.trim();
    const word = document.getElementById("auth-word-admin").value.trim();

    if (!word) {
        alert("정답 단어를 입력하세요.");
        return;
    }
    if (!question) {
        alert("학생에게 보여줄 문제를 입력하세요.");
        return;
    }

    await db.ref(`${PATH.CONFIG}`).update({
        authQuestion: question,
        authWord: word
    });
});

/* =========================
   게임 상태 제어
========================= */
document.getElementById("btn-start").addEventListener("click", async () => {
    const wordSnap = await db.ref(`${PATH.CONFIG}/authWord`).once("value");
    if (!wordSnap.val()) {
        alert("인증 문제를 먼저 설정하세요.");
        return;
    }
    const itemsSnap = await db.ref(`${PATH.ITEMS}`).once("value");
    if (!itemsSnap.val()) {
        alert("항목을 먼저 등록하세요.");
        return;
    }
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.OPEN });
    alert("신청 시작");
});

document.getElementById("btn-end").addEventListener("click", async () => {
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.END });
    alert("신청 종료");
});

document.getElementById("btn-reset").addEventListener("click", async () => {
    const ok = confirm("전체 초기화하시겠습니까?\n(신청 내역과 접속 상태가 모두 삭제됩니다.\n항목 목록, 인증 문제, 비밀번호는 유지됩니다)");
    if (!ok) return;

    if (!currentConfig) {
        alert("설정 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
        return;
    }

    const pwSnap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
    const currentAdminPw = pwSnap.val() || "1234";

    const studentsSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const existingStudents = studentsSnap.val() || {};

    const newStudents = generateStudents(currentConfig.studentCount);
    for (const id in newStudents) {
        if (existingStudents[id] && existingStudents[id].password) {
            newStudents[id].password = existingStudents[id].password;
        }
    }

    // 항목은 유지하되 participants만 비움
    const itemsSnap = await db.ref(`${PATH.ITEMS}`).once("value");
    const existingItems = itemsSnap.val() || {};
    const resetItems = {};
    for (const itemId in existingItems) {
        resetItems[itemId] = {
            name: existingItems[itemId].name,
            capacity: existingItems[itemId].capacity,
            participants: {}
        };
    }

    await db.ref(`${PATH.GAME}`).set(getInitialGame(currentAdminPw));
    await db.ref(`${PATH.STUDENTS}`).set(newStudents);
    await db.ref(`${PATH.ITEMS}`).set(resetItems);

    alert("초기화 완료 (항목 목록, 인증 문제, 관리자/학생 비밀번호는 유지됩니다)");
});

/* =========================
   학생 목록 실시간
========================= */
function listenStudents() {
    db.ref(`${PATH.STUDENTS}`).on("value", (snap) => {
        cachedStudents = snap.val() || {};
        renderStudentList();
        renderItemsStatusList();
    });
}

function renderStudentList() {
    const list = document.getElementById("student-list");
    list.innerHTML = "";

    const ids = Object.keys(cachedStudents)
        .map(id => parseInt(id, 10))
        .sort((a, b) => a - b);

    let onlineCount = 0;

    for (const id of ids) {
        const s = cachedStudents[id];
        const status = s.status || "OFFLINE";
        if (status === STUDENT_STATE.ONLINE || status === STUDENT_STATE.DONE) {
            onlineCount++;
        }

        const row = document.createElement("div");
        row.className = "student-row";

        const idSpan = document.createElement("span");
        idSpan.innerText = `#${id}`;

        const statusSpan = document.createElement("span");
        statusSpan.className = `status-badge status-${status.toLowerCase()}`;
        statusSpan.innerText = status;

        const selCount = s.selections ? Object.keys(s.selections).length : 0;
        const selSpan = document.createElement("span");
        selSpan.className = "student-seat";
        selSpan.innerText = selCount > 0 ? `${selCount}개 신청` : "-";

        row.appendChild(idSpan);
        row.appendChild(statusSpan);
        row.appendChild(selSpan);
        list.appendChild(row);
    }

    updateConnectCountLabel(onlineCount);
}

function updateConnectCountLabel(onlineCount) {
    const total = currentConfig ? currentConfig.studentCount : 0;

    let count = onlineCount;
    if (count === undefined) {
        count = 0;
        for (const id in cachedStudents) {
            const status = cachedStudents[id].status || "OFFLINE";
            if (status === STUDENT_STATE.ONLINE || status === STUDENT_STATE.DONE) count++;
        }
    }

    document.getElementById("connect-count").innerText = `${count} / ${total}`;
}

/* =========================
   항목별 신청 현황 (번호순)
========================= */
function renderItemsStatusList() {
    const container = document.getElementById("items-status-list");
    if (!container) return;
    container.innerHTML = "";

    const itemIds = Object.keys(cachedItems);
    if (itemIds.length === 0) {
        container.innerHTML = `<p class="hint-text">등록된 항목이 없습니다.</p>`;
        return;
    }

    itemIds.forEach(itemId => {
        const item = cachedItems[itemId];
        const participantIds = item.participants
            ? Object.keys(item.participants).map(id => parseInt(id, 10)).sort((a, b) => a - b)
            : [];

        const box = document.createElement("div");
        box.className = "item-status-box";

        const title = document.createElement("div");
        title.className = "item-status-title";
        title.innerText = `${item.name} (${participantIds.length}/${item.capacity}명)`;
        box.appendChild(title);

        const namesLine = document.createElement("div");
        namesLine.className = "item-status-names";
        namesLine.innerText = participantIds.length > 0
            ? participantIds.map(id => `#${id}`).join(", ")
            : "신청자 없음";
        box.appendChild(namesLine);

        container.appendChild(box);
    });
}

/* =========================
   학생 비밀번호 CSV 다운로드
========================= */
document.getElementById("btn-download-csv").addEventListener("click", async () => {
    const snap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const data = snap.val() || {};

    const rows = Object.keys(data)
        .map(id => parseInt(id, 10))
        .sort((a, b) => a - b)
        .map(id => `${id},${data[id].password}`);

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "student_passwords.csv";
    a.click();
    URL.revokeObjectURL(url);
});

/* =========================
   학생 비밀번호 CSV 업로드/적용
========================= */
document.getElementById("btn-apply-csv").addEventListener("click", () => {
    const fileInput = document.getElementById("csv-upload");
    const status = document.getElementById("csv-status");
    status.innerText = "";

    const file = fileInput.files[0];
    if (!file) {
        status.innerText = "CSV 파일을 선택하세요.";
        return;
    }

    const maxId = currentConfig?.studentCount || 29;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0);

        const updates = {};
        const errors = [];
        let successCount = 0;

        lines.forEach((line, idx) => {
            const parts = line.split(",").map(p => p.trim());
            if (parts.length !== 2) {
                errors.push(`${idx + 1}행 형식 오류`);
                return;
            }

            const [idStr, pw] = parts;
            const id = parseInt(idStr, 10);

            if (isNaN(id) || id < 1 || id > maxId) {
                errors.push(`${idx + 1}행 번호 오류(${idStr})`);
                return;
            }
            if (!pw) {
                errors.push(`${idx + 1}행 비밀번호 없음`);
                return;
            }

            updates[`${PATH.STUDENTS}/${id}/password`] = pw;
            successCount++;
        });

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }

        let message = `✅ ${successCount}명 비밀번호 적용 완료`;
        if (errors.length > 0) {
            message += ` / ⚠️ 오류 ${errors.length}건: ${errors.join(", ")}`;
        }
        status.innerText = message;
        fileInput.value = "";
    };

    reader.readAsText(file);
});

/* =========================
   게임 상태 표시
========================= */
function listenGame() {
    db.ref(`${PATH.GAME}`).on("value", (snap) => {
        const game = snap.val();
        if (!game) return;

        let status = "";
        if (game.state === GAME_STATE.WAIT) status = "대기 중";
        if (game.state === GAME_STATE.OPEN) status = "진행 중";
        if (game.state === GAME_STATE.END) status = "종료";

        document.getElementById("game-status-text").innerText = `현재 상태: ${status}`;
    });
}