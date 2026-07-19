/* =========================
   전역 상태
========================= */
let myId = null;
let myData = null;
let currentGame = null;
let currentConfig = null;
let cachedItems = {};
let pendingItemId = null; // 지금 인증 모달로 확정하려는 항목

/* =========================
   설정(config) 로드
========================= */
async function loadConfig() {
    const snap = await db.ref(`${PATH.CONFIG}`).once("value");
    currentConfig = snap.val();
    if (currentConfig) {
        document.getElementById("student-id").placeholder = `번호 (1~${currentConfig.studentCount})`;
    }
}

function listenConfig() {
    db.ref(`${PATH.CONFIG}`).on("value", (snap) => {
        currentConfig = snap.val();
        if (!currentConfig) return;
        document.getElementById("student-id").placeholder = `번호 (1~${currentConfig.studentCount})`;
        updateSelectionModeHint();
        renderItemsList();
    });
}

function updateSelectionModeHint() {
    const hint = document.getElementById("selection-mode-hint");
    if (!currentConfig) return;

    if (currentConfig.selectionMode === "multi") {
        hint.innerText = `최대 ${currentConfig.maxSelections}개까지 선택할 수 있습니다. 다 고르셨으면 '선택 완료'를 눌러주세요.`;
        document.getElementById("multi-selection-footer").classList.remove("hidden");
    } else {
        hint.innerText = "항목을 하나 선택하면 바로 확정됩니다.";
        document.getElementById("multi-selection-footer").classList.add("hidden");
    }
}

/* =========================
   실시간 접속 감지 (presence)
========================= */
function setupPresence() {
    const connectedRef = db.ref(".info/connected");
    connectedRef.on("value", (snap) => {
        if (snap.val() === true && myId) {
            const myRef = db.ref(`${PATH.STUDENTS}/${myId}`);
            myRef.onDisconnect().update({ status: STUDENT_STATE.OFFLINE });
            myRef.update({ status: STUDENT_STATE.ONLINE });
        }
    });
}

/* =========================
   화면 전환
========================= */
function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
}

/* =========================
   로그인 처리
========================= */
document.getElementById("btn-login").addEventListener("click", async () => {
    const id = document.getElementById("student-id").value;
    const pw = document.getElementById("student-pw").value;
    const error = document.getElementById("login-error");
    error.innerText = "";

    if (!id || !pw) {
        error.innerText = "번호와 비밀번호를 입력하세요.";
        return;
    }

    if (!currentConfig) {
        await loadConfig();
    }
    if (currentConfig && parseInt(id, 10) > currentConfig.studentCount) {
        error.innerText = `현재 학생 수는 ${currentConfig.studentCount}명입니다.`;
        return;
    }

    const snap = await db.ref(`${PATH.STUDENTS}/${id}`).once("value");
    const data = snap.val();

    if (!data) {
        error.innerText = "존재하지 않는 번호입니다.";
        return;
    }
    if (data.password !== pw) {
        error.innerText = "비밀번호가 틀렸습니다.";
        return;
    }

    myId = id;
    myData = data;
    localStorage.setItem("myId", myId);

    await db.ref(`${PATH.STUDENTS}/${id}`).update({
        status: STUDENT_STATE.ONLINE,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });

    initListeners();
    setupPresence();
});

/* =========================
   로그아웃 처리
========================= */
async function logout() {
    if (myId) {
        await db.ref(`${PATH.STUDENTS}/${myId}`).update({
            status: STUDENT_STATE.OFFLINE
        });
    }
    localStorage.removeItem("myId");
    location.reload();
}

document.getElementById("btn-logout-wait")?.addEventListener("click", logout);
document.getElementById("btn-logout-result")?.addEventListener("click", logout);

/* =========================
   리스너 통합
========================= */
function initListeners() {
    listenConfig();

    // 1. 게임 상태 감시
    db.ref(`${PATH.GAME}`).on("value", (snap) => {
        currentGame = snap.val();
        if (!currentGame) return;

        if (currentGame.state === GAME_STATE.WAIT) {
            showView("wait-view");
            document.getElementById("wait-id").innerText = myId;
            db.ref(`${PATH.STUDENTS}/${myId}`).update({ status: STUDENT_STATE.ONLINE });
        } else if (currentGame.state === GAME_STATE.OPEN) {
            if (myData?.status === STUDENT_STATE.DONE) {
                showResult();
            } else {
                showView("main-view");
            }
        } else if (currentGame.state === GAME_STATE.END) {
            document.getElementById("modal").classList.add("hidden");
            showResult();
        }
    });

    // 2. 항목 실시간 감시 (정원 표시용)
    db.ref(`${PATH.ITEMS}`).on("value", (snap) => {
        cachedItems = snap.val() || {};
        renderItemsList();
    });

    // 3. 내 데이터 감시
    db.ref(`${PATH.STUDENTS}/${myId}`).on("value", (snap) => {
        myData = snap.val();
        renderItemsList();

        if (myData?.status === STUDENT_STATE.DONE) {
            const mainView = document.getElementById("main-view");
            if (!mainView.classList.contains("hidden")) {
                showResult();
            }
        }
    });
}

/* =========================
   항목 리스트 렌더링 (선택 화면)
========================= */
function renderItemsList() {
    const container = document.getElementById("items-container");
    if (!container || !currentConfig) return;

    container.innerHTML = "";

    const mySelections = (myData && myData.selections) || {};
    const mySelectedCount = Object.keys(mySelections).length;
    const isMulti = currentConfig.selectionMode === "multi";
    const reachedMax = isMulti && mySelectedCount >= currentConfig.maxSelections;

    const ids = Object.keys(cachedItems);
    for (const itemId of ids) {
        const item = cachedItems[itemId];
        const participantCount = item.participants ? Object.keys(item.participants).length : 0;
        const isFull = participantCount >= item.capacity;
        const isSelectedByMe = !!mySelections[itemId];

        const card = document.createElement("div");
        card.className = "item-card";
        if (isSelectedByMe) card.classList.add("selected-by-me");
        if (isFull && !isSelectedByMe) card.classList.add("full");

        const nameEl = document.createElement("div");
        nameEl.className = "item-name";
        nameEl.innerText = item.name;

        const countEl = document.createElement("div");
        countEl.className = "item-count";
        countEl.innerText = `${participantCount} / ${item.capacity}명`;

        card.appendChild(nameEl);
        card.appendChild(countEl);

        if (isSelectedByMe) {
            const badge = document.createElement("div");
            badge.className = "item-badge";
            badge.innerText = "선택됨";
            card.appendChild(badge);
        } else if (isFull) {
            const badge = document.createElement("div");
            badge.className = "item-badge full-badge";
            badge.innerText = "마감";
            card.appendChild(badge);
        } else if (!isMulti && mySelectedCount > 0) {
            // single 모드에서 이미 다른 항목을 확정했다면 더 이상 선택 불가 (이론상 result-view로 넘어가 있어야 하지만 안전장치)
            card.classList.add("full");
        } else if (reachedMax) {
            card.classList.add("full");
        } else {
            card.onclick = () => openModal(itemId);
        }

        container.appendChild(card);
    }

    // multi 모드 하단 진행 상황 갱신
    if (isMulti) {
        const countText = document.getElementById("multi-selection-count");
        countText.innerText = `현재 ${mySelectedCount} / ${currentConfig.maxSelections}개 선택함`;
    }
}

/* =========================
   결과 화면 (내 신청 내역만 간단히 표시)
========================= */
function showResult() {
    showView("result-view");
    document.getElementById("result-id").innerText = myId;

    const list = document.getElementById("my-selections-list");
    const selections = (myData && myData.selections) || {};
    const names = Object.values(selections);

    if (names.length === 0) {
        list.innerHTML = `<p>신청한 항목이 없습니다.</p>`;
        return;
    }

    list.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "my-selection-list";
    names.forEach(name => {
        const li = document.createElement("li");
        li.innerText = name;
        ul.appendChild(li);
    });
    list.appendChild(ul);
}

/* =========================
   항목 클릭 → 인증 모달
========================= */
function openModal(itemId) {
    pendingItemId = itemId;
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("captcha-input").value = "";

    db.ref(`${PATH.CONFIG}/authQuestion`).once("value", (snap) => {
        document.getElementById("captcha-text").innerText = snap.val() || "문제가 설정되지 않았습니다";
    });
}

document.getElementById("btn-cancel").addEventListener("click", () => {
    document.getElementById("modal").classList.add("hidden");
    pendingItemId = null;
});

document.getElementById("btn-confirm").addEventListener("click", async () => {
    if (!pendingItemId) return;

    // 1. 정답 확인
    const input = document.getElementById("captcha-input").value;
    const authSnap = await db.ref(`${PATH.CONFIG}/authWord`).once("value");
    if (!checkCaptcha(input, authSnap.val())) {
        alert("인증 단어가 틀렸습니다.");
        return;
    }

    const itemId = pendingItemId;

    // 2. 트랜잭션으로 정원 체크 + 신청자 등록
    const itemRef = db.ref(`${PATH.ITEMS}/${itemId}`);
    const result = await itemRef.transaction((item) => {
        if (!item) return item;
        const participants = item.participants || {};
        if (participants[myId]) {
            return; // 이미 신청됨 → 중단
        }
        const count = Object.keys(participants).length;
        if (count >= item.capacity) {
            return; // 정원 초과 → 중단
        }
        participants[myId] = true;
        item.participants = participants;
        return item;
    });

    if (!result.committed || !result.snapshot.val()?.participants?.[myId]) {
        alert("이미 정원이 마감된 항목입니다. 다른 항목을 선택해주세요.");
        document.getElementById("modal").classList.add("hidden");
        pendingItemId = null;
        return;
    }

    // 3. 학생 데이터에도 선택 내역 기록 (항목 이름을 그대로 저장해서, 나중에 항목이 바뀌어도 신청 당시 이름이 유지됨)
    const itemName = result.snapshot.val().name;
    await db.ref(`${PATH.STUDENTS}/${myId}/selections/${itemId}`).set(itemName);

    document.getElementById("modal").classList.add("hidden");
    pendingItemId = null;

    // 4. single 모드면 바로 확정 완료 처리
    if (currentConfig.selectionMode !== "multi") {
        await db.ref(`${PATH.STUDENTS}/${myId}`).update({ status: STUDENT_STATE.DONE });
    }
});

/* =========================
   선택 완료 (multi 모드 전용)
========================= */
document.getElementById("btn-finish-selection").addEventListener("click", async () => {
    await db.ref(`${PATH.STUDENTS}/${myId}`).update({ status: STUDENT_STATE.DONE });
});

/* =========================
   자동 로그인 (새로고침 대응)
========================= */
window.addEventListener("load", async () => {
    await loadConfig();

    const savedId = localStorage.getItem("myId");
    if (savedId) {
        myId = savedId;
        const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
        myData = snap.val();
        if (myData) {
            await db.ref(`${PATH.STUDENTS}/${myId}`).update({
                status: myData.status === STUDENT_STATE.DONE ? STUDENT_STATE.DONE : STUDENT_STATE.ONLINE
            });
            initListeners();
            setupPresence();
        }
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        document.getElementById("modal").classList.add("hidden");
        pendingItemId = null;
    }
});