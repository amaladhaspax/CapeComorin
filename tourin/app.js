"use strict";

const places = [
    {
        name: "Kanyakumari Sunrise Point",
        description: "Watch the sun rise where the Arabian Sea, Bay of Bengal, and Indian Ocean meet.",
        icon: "☼",
        query: "Sunrise Point Kanyakumari"
    },
    {
        name: "Vivekananda Rock Memorial",
        description: "A celebrated memorial on a rocky island just off the coast of Kanyakumari.",
        icon: "⌂",
        query: "Vivekananda Rock Memorial"
    },
    {
        name: "Vattakottai Fort",
        description: "A seaside fort with coastal views, a short drive from the town centre.",
        icon: "⌖",
        query: "Vattakottai Fort"
    }
];

let participants = [];
let schedules = [];
let lodges = [];
let locationWatchId = null;
let currentRole = null;
let workspaceLoadId = 0;
let supabaseClient = null;
let deferredInstallPrompt = null;

const participantForm = document.querySelector("#participant-form");
const scheduleForm = document.querySelector("#schedule-form");
const lodgeForm = document.querySelector("#lodge-form");
const participantList = document.querySelector("#participant-list");
const scheduleList = document.querySelector("#schedule-list");
const participantScheduleList = document.querySelector("#participant-schedule-list");
const lodgeList = document.querySelector("#lodge-list");
const loginForm = document.querySelector("#login-form");
const loginSubmit = document.querySelector("#login-submit");
const loginStatus = document.querySelector("#login-status");
const installStatus = document.querySelector("#install-status");

function setInstallStatus(message) {
    if (!document.querySelector("#login-screen").hidden) {
        installStatus.textContent = message;
    } else {
        document.querySelector("#auth-message").textContent = message;
    }
}

async function installApp() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const result = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        setInstallStatus(
            result.outcome === "accepted"
                ? "Tourin is being installed."
                : "Installation cancelled. You can install Tourin later from your browser menu."
        );
        return;
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
        setInstallStatus("In Safari, tap Share, then choose Add to Home Screen.");
    } else if (!window.isSecureContext) {
        setInstallStatus("Open Tourin from its HTTPS website to install it. A file:// page cannot be installed.");
    } else {
        setInstallStatus("Use your browser menu and choose Install app or Add to Home screen.");
    }
}

function configurePwa() {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
        || navigator.standalone === true;
    if (isStandalone) {
        document.querySelectorAll(".install-button").forEach((button) => {
            button.hidden = true;
        });
    }

    if ("serviceWorker" in navigator && window.isSecureContext) {
        navigator.serviceWorker.register("./service-worker.js")
            .catch((error) => {
                console.error("Could not register the Tourin offline app shell.", error);
                setInstallStatus("Offline app setup failed. Check the published HTTPS site and reload.");
            });
    }
}

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelectorAll(".install-button").forEach((button) => {
        button.hidden = true;
    });
    setInstallStatus("Tourin was installed successfully.");
});

const viewsByRole = {
    admin: new Set(["dashboard", "participants", "places", "schedule", "lodges", "location"]),
    participant: new Set(["participant-home", "participant-schedule", "places", "lodges", "location"])
};

function setLoginStatus(message, isError = false) {
    loginStatus.textContent = message;
    loginStatus.classList.toggle("error", isError);
}

function selectedRole() {
    return document.querySelector('input[name="login-role"]:checked').value;
}

function updateLoginButton() {
    const role = selectedRole();
    loginSubmit.textContent = `Sign in as ${role === "admin" ? "administrator" : "participant"}`;
    loginSubmit.disabled = supabaseClient === null;
}

function returnToLogin(message) {
    workspaceLoadId += 1;
    if (locationWatchId !== null) {
        stopLocationSharing("Location sharing stopped because you signed out.");
    }
    currentRole = null;
    participants = [];
    schedules = [];
    lodges = [];
    updateParticipantList();
    updateScheduleList();
    updateLodgeList();
    document.querySelector("#app-shell").hidden = true;
    document.querySelector("#login-screen").hidden = false;
    document.querySelector("#login-form").reset();
    document.querySelector('input[name="login-role"][value="admin"]').checked = true;
    updateLoginButton();
    if (message) setLoginStatus(message);
}

async function activateWorkspace(role, user) {
    currentRole = role;
    document.querySelector("#login-screen").hidden = true;
    document.querySelector("#app-shell").hidden = false;
    document.querySelector("#account-label").textContent = user.email || role;
    document.querySelector("#account-avatar").textContent =
        (user.email || role).trim().charAt(0).toUpperCase();
    document.querySelector("#workspace-label").textContent =
        role === "admin" ? "Admin workspace" : "Participant workspace";

    document.querySelectorAll(".nav-link").forEach((link) => {
        link.hidden = !link.dataset.roles.split(",").includes(role);
    });
    document.querySelector("#lodge-admin-form").hidden = role !== "admin";
    showView(role === "admin" ? "dashboard" : "participant-home");
    await loadWorkspaceData();
}

async function getUserRole(user) {
    const { data, error } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        console.error("Could not verify the signed-in user's role.", error);
        return { role: null, error: true };
    }
    const role = data?.role;
    return {
        role: role === "admin" || role === "participant" ? role : null,
        error: false
    };
}

async function signOutAfterRejectedLogin() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error("Could not clear the rejected sign-in session.", error);
        setLoginStatus("Access was denied, and the session could not be cleared. Close this page and check Supabase setup.", true);
        return false;
    }
    return true;
}

async function verifyAndOpenWorkspace(user, requestedRole) {
    const result = await getUserRole(user);
    if (result.error) {
        if (!await signOutAfterRejectedLogin()) return;
        setLoginStatus("Could not verify your account role. Check the Supabase role table and access policy.", true);
        return;
    }
    if (!result.role) {
        if (!await signOutAfterRejectedLogin()) return;
        setLoginStatus("This account has no assigned Tourin role. Ask your administrator for access.", true);
        return;
    }
    if (result.role !== requestedRole) {
        if (!await signOutAfterRejectedLogin()) return;
        setLoginStatus(`This account is assigned as ${result.role}. Choose the matching account type and try again.`, true);
        return;
    }
    await activateWorkspace(result.role, user);
}

async function handleLogin(event) {
    event.preventDefault();
    if (!supabaseClient) {
        setLoginStatus("Protected sign-in is unavailable until Supabase is configured.", true);
        return;
    }

    const formData = new FormData(loginForm);
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    const requestedRole = selectedRole();
    loginSubmit.disabled = true;
    setLoginStatus("Signing in…");

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    loginForm.elements.password.value = "";
    if (error) {
        loginSubmit.disabled = false;
        console.error("Supabase sign-in failed.", error);
        setLoginStatus("Sign-in failed. Check your email and password, or ask your administrator for an invite.", true);
        return;
    }
    if (!data.user) {
        loginSubmit.disabled = false;
        setLoginStatus("Sign-in did not return an account. Please try again.", true);
        return;
    }
    await verifyAndOpenWorkspace(data.user, requestedRole);
    loginSubmit.disabled = false;
}

async function initializeAuthentication() {
    const config = window.TOURIN_SUPABASE_CONFIG;
    const hasConfig = config
        && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url)
        && config.anonKey
        && !config.anonKey.includes("YOUR_");

    if (!hasConfig) {
        setLoginStatus("Set up Supabase in supabase-config.js to enable protected sign-in. No credentials are sent until it is configured.");
        updateLoginButton();
        return;
    }
    if (!window.supabase?.createClient) {
        setLoginStatus("Could not load the Supabase sign-in client. Check your internet connection and reload.", true);
        updateLoginButton();
        return;
    }

    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    updateLoginButton();
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") returnToLogin("You have signed out.");
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error("Could not restore the Supabase session.", error);
        setLoginStatus("Could not check your saved sign-in. Please try again.", true);
        return;
    }
    setLoginStatus("Supabase is configured. Sign in with an invited account and its assigned role.");
    if (data.session?.user) {
        setLoginStatus("Checking your assigned role…");
        const result = await getUserRole(data.session.user);
        if (result.error || !result.role) {
            if (!await signOutAfterRejectedLogin()) return;
            setLoginStatus(
                result.error
                    ? "Could not verify your account role. Check the Supabase role table and access policy."
                    : "This account has no assigned Tourin role. Ask your administrator for access.",
                true
            );
            return;
        }
        await activateWorkspace(result.role, data.session.user);
    }
}

function makeCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    return cell;
}

function makeActionCell(id, action, label) {
    const cell = document.createElement("td");
    const button = document.createElement("button");
    button.className = "table-action";
    button.type = "button";
    button.dataset.action = action;
    button.dataset.id = id;
    button.textContent = label;
    cell.append(button);
    return cell;
}

function setDataStatus(message, isError = false) {
    const status = document.querySelector("#auth-message");
    status.textContent = message;
    status.classList.toggle("error", isError);
}

async function loadWorkspaceData() {
    if (!supabaseClient || !currentRole) return;

    const loadId = ++workspaceLoadId;
    const role = currentRole;
    participants = [];
    schedules = [];
    lodges = [];
    updateParticipantList();
    updateScheduleList();
    updateLodgeList();
    setDataStatus("Loading shared trip information…");

    const participantRequest = role === "admin"
        ? supabaseClient.from("participants").select("id,name,phone,address").order("name")
        : Promise.resolve({ data: [], error: null });
    let participantResult;
    let scheduleResult;
    let lodgeResult;
    try {
        [participantResult, scheduleResult, lodgeResult] = await Promise.all([
            participantRequest,
            supabaseClient.from("schedules")
                .select("id,activity,place,visit_date,start_time,end_time")
                .order("visit_date")
                .order("start_time"),
            supabaseClient.from("lodges").select("id,city,name,phone,address").order("city").order("name")
        ]);
    } catch (error) {
        if (loadId !== workspaceLoadId || role !== currentRole) return;
        console.error("Could not reach Supabase while loading trip information.", error);
        setDataStatus("Could not reach the server. Check your connection and try again.", true);
        return;
    }

    if (loadId !== workspaceLoadId || role !== currentRole) return;

    const failedRequest = [
        ["participants", participantResult],
        ["schedules", scheduleResult],
        ["lodging options", lodgeResult]
    ].find(([, result]) => result.error);
    if (failedRequest) {
        const [resource, result] = failedRequest;
        console.error(`Could not load ${resource}.`, result.error);
        setDataStatus(`Could not load ${resource}. Check the Supabase schema and access policies, then try again.`, true);
        return;
    }

    participants = participantResult.data || [];
    schedules = (scheduleResult.data || []).map((schedule) => ({
        id: schedule.id,
        activity: schedule.activity,
        place: schedule.place,
        date: schedule.visit_date,
        start_time: schedule.start_time,
        end_time: schedule.end_time
    }));
    lodges = lodgeResult.data || [];
    updateParticipantList();
    updateScheduleList();
    updateLodgeList();
    setDataStatus("");
}

function updateParticipantList() {
    participantList.replaceChildren();
    participants.forEach((participant) => {
        const row = document.createElement("tr");
        row.append(
            makeCell(participant.name),
            makeCell(participant.phone),
            makeCell(participant.address),
            makeActionCell(participant.id, "remove-participant", "Remove")
        );
        participantList.append(row);
    });

    const isEmpty = participants.length === 0;
    document.querySelector("#participant-empty").hidden = !isEmpty;
    document.querySelector("#participant-list-count").textContent =
        `${participants.length} ${participants.length === 1 ? "person" : "people"}`;
    document.querySelector("#participant-count").textContent = String(participants.length);
}

function renderSchedules(target, includeActions) {
    target.replaceChildren();
    schedules.forEach((schedule) => {
        const row = document.createElement("tr");
        row.append(
            makeCell(new Date(`${schedule.date}T00:00:00`).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric"
            })),
            makeCell(`${schedule.start_time.slice(0, 5)} - ${schedule.end_time.slice(0, 5)}`),
            makeCell(schedule.activity),
            makeCell(schedule.place)
        );
        if (includeActions) row.append(makeActionCell(schedule.id, "remove-schedule", "Remove"));
        target.append(row);
    });
}

function updateScheduleList() {
    renderSchedules(scheduleList, true);
    renderSchedules(participantScheduleList, false);
    const isEmpty = schedules.length === 0;
    document.querySelector("#schedule-empty").hidden = !isEmpty;
    document.querySelector("#participant-schedule-empty").hidden = !isEmpty;
    document.querySelector("#schedule-list-count").textContent =
        `${schedules.length} ${schedules.length === 1 ? "activity" : "activities"}`;
    document.querySelector("#participant-schedule-list-count").textContent =
        `${schedules.length} ${schedules.length === 1 ? "activity" : "activities"}`;
    document.querySelector("#schedule-count").textContent = String(schedules.length);
}

function updateLodgeList() {
    lodgeList.replaceChildren();
    const sortedLodges = [...lodges].sort((a, b) =>
        a.city.localeCompare(b.city) || a.name.localeCompare(b.name)
    );
    sortedLodges.forEach((lodge) => {
        const row = document.createElement("tr");
        row.append(
            makeCell(lodge.city),
            makeCell(lodge.name),
            makeCell(lodge.phone),
            makeCell(lodge.address),
            ...(currentRole === "admin" ? [makeActionCell(lodge.id, "remove-lodge", "Remove")] : [])
        );
        lodgeList.append(row);
    });
    document.querySelector("#lodge-empty").hidden = lodges.length !== 0;
    document.querySelector("#lodge-list-count").textContent =
        `${lodges.length} ${lodges.length === 1 ? "lodge" : "lodges"}`;
}

function renderPlaces() {
    const placeList = document.querySelector("#places-list");
    const schedulePlace = document.querySelector("#schedule-place");
    placeList.replaceChildren();
    schedulePlace.replaceChildren();

    places.forEach((place) => {
        const card = document.createElement("article");
        card.className = "place-card";

        const art = document.createElement("div");
        art.className = "place-art";
        art.setAttribute("aria-hidden", "true");
        art.textContent = place.icon;

        const body = document.createElement("div");
        body.className = "place-body";
        const heading = document.createElement("h2");
        heading.textContent = place.name;
        const description = document.createElement("p");
        description.textContent = place.description;
        const mapLink = document.createElement("a");
        mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.query)}`;
        mapLink.target = "_blank";
        mapLink.rel = "noopener noreferrer";
        mapLink.textContent = "View on Google Maps ↗";
        body.append(heading, description, mapLink);
        card.append(art, body);
        placeList.append(card);

        const option = document.createElement("option");
        option.value = place.name;
        option.textContent = place.name;
        schedulePlace.append(option);
    });
}

function showView(name) {
    if (!currentRole || !viewsByRole[currentRole].has(name)) return;

    document.querySelectorAll(".view").forEach((view) => {
        const isActive = view.id === `${name}-view`;
        view.hidden = !isActive;
        view.classList.toggle("active", isActive);
    });
    document.querySelectorAll(".nav-link").forEach((link) => {
        const isActive = link.dataset.view === name;
        link.classList.toggle("active", isActive);
        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
    document.querySelector(`#${name}-title`)?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopLocationSharing(message) {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
    const toggle = document.querySelector("#location-toggle");
    toggle.textContent = "Start location sharing";
    toggle.classList.remove("button-stop");
    document.querySelector("#coordinates").hidden = true;
    document.querySelector("#location-status").textContent = message;
}

function startLocationSharing() {
    if (!("geolocation" in navigator)) {
        document.querySelector("#location-status").textContent =
            "This browser does not support device location.";
        return;
    }

    document.querySelector("#location-status").textContent =
        "Waiting for browser permission and a location fix…";
    document.querySelector("#location-toggle").textContent = "Stop location sharing";

    locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            document.querySelector("#coordinates").hidden = false;
            document.querySelector("#coordinate-value").textContent =
                `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)} m)`;
            const mapLink = document.querySelector("#map-link");
            mapLink.href = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
            document.querySelector("#location-status").textContent =
                "Sharing on this device only. Stop at any time.";
        },
        (error) => {
            const message = error.code === error.PERMISSION_DENIED
                ? "Location permission was denied. You can allow it in your browser settings."
                : error.code === error.POSITION_UNAVAILABLE
                    ? "Your device could not determine a location."
                    : "The location request timed out. Try again when your signal is better.";
            stopLocationSharing(message);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
}

document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
        showView(button.dataset.view);
        loadWorkspaceData();
    });
});

document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => {
        showView(button.dataset.openView);
        loadWorkspaceData();
    });
});

document.querySelectorAll('input[name="login-role"]').forEach((input) => {
    input.addEventListener("change", updateLoginButton);
});

loginForm.addEventListener("submit", handleLogin);

document.querySelector("#sign-out").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const { error } = await supabaseClient.auth.signOut();
    button.disabled = false;
    if (error) {
        console.error("Supabase sign-out failed.", error);
        document.querySelector("#auth-message").textContent = "Sign-out failed. Please try again.";
    } else {
        document.querySelector("#auth-message").textContent = "";
    }
});

document.querySelectorAll(".install-button").forEach((button) => {
    button.addEventListener("click", installApp);
});

participantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(participantForm);
    const entry = {
        name: String(formData.get("name")).trim(),
        phone: String(formData.get("phone")).trim(),
        address: String(formData.get("address")).trim()
    };
    const submitButton = participantForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
        const { data, error } = await supabaseClient
            .from("participants")
            .insert(entry)
            .select("id,name,phone,address")
            .single();
        if (error) {
            console.error("Could not save participant details.", error);
            setDataStatus("Could not save this participant. Check the database access policy and try again.", true);
            return;
        }
        participants.push(data);
        participants.sort((a, b) => a.name.localeCompare(b.name));
        updateParticipantList();
        participantForm.reset();
        setDataStatus("Participant added.");
    } catch (error) {
        console.error("Could not reach Supabase while saving participant details.", error);
        setDataStatus("Could not reach the server. Check your connection and try again.", true);
    } finally {
        submitButton.disabled = false;
    }
});

scheduleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(scheduleForm);
    const startTime = String(formData.get("start_time"));
    const endTime = String(formData.get("end_time"));
    if (endTime <= startTime) {
        setDataStatus("The end time must be later than the start time.", true);
        return;
    }
    const entry = {
        activity: String(formData.get("activity")).trim(),
        place: String(formData.get("place")),
        visit_date: String(formData.get("date")),
        start_time: startTime,
        end_time: endTime
    };
    const submitButton = scheduleForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
        const { data, error } = await supabaseClient
            .from("schedules")
            .insert(entry)
            .select("id,activity,place,visit_date,start_time,end_time")
            .single();
        if (error) {
            console.error("Could not save schedule item.", error);
            setDataStatus("Could not save this visit. Check the database access policy and try again.", true);
            return;
        }
        schedules.push({
            id: data.id,
            activity: data.activity,
            place: data.place,
            date: data.visit_date,
            start_time: data.start_time,
            end_time: data.end_time
        });
        schedules.sort((a, b) =>
            `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)
        );
        updateScheduleList();
        scheduleForm.reset();
        setDataStatus("Visit added to the shared schedule.");
    } catch (error) {
        console.error("Could not reach Supabase while saving schedule item.", error);
        setDataStatus("Could not reach the server. Check your connection and try again.", true);
    } finally {
        submitButton.disabled = false;
    }
});

lodgingFormEvent();

function lodgingFormEvent() {
    lodgeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(lodgeForm);
        const entry = {
            city: String(formData.get("city")).trim(),
            name: String(formData.get("name")).trim(),
            phone: String(formData.get("phone")).trim(),
            address: String(formData.get("address")).trim()
        };
        const submitButton = lodgeForm.querySelector("button[type='submit']");
        submitButton.disabled = true;
        try {
            const { data, error } = await supabaseClient
                .from("lodges")
                .insert(entry)
                .select("id,city,name,phone,address")
                .single();
            if (error) {
                console.error("Could not save lodging details.", error);
                setDataStatus("Could not save this lodge. Check the database access policy and try again.", true);
                return;
            }
            lodges.push(data);
            updateLodgeList();
            lodgeForm.reset();
            setDataStatus("Lodge added to the directory.");
        } catch (error) {
            console.error("Could not reach Supabase while saving lodging details.", error);
            setDataStatus("Could not reach the server. Check your connection and try again.", true);
        } finally {
            submitButton.disabled = false;
        }
    });
}

async function removeRecord(table, id, label) {
    try {
        const { error } = await supabaseClient.from(table).delete().eq("id", id);
        if (error) {
            console.error(`Could not remove ${label}.`, error);
            setDataStatus(`Could not remove this ${label}. Check the database access policy and try again.`, true);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`Could not reach Supabase while removing ${label}.`, error);
        setDataStatus("Could not reach the server. Check your connection and try again.", true);
        return false;
    }
}

participantList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='remove-participant']");
    if (!button) return;
    if (!await removeRecord("participants", button.dataset.id, "participant")) return;
    participants = participants.filter((participant) => participant.id !== button.dataset.id);
    updateParticipantList();
});

scheduleList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='remove-schedule']");
    if (!button) return;
    if (!await removeRecord("schedules", button.dataset.id, "schedule item")) return;
    schedules = schedules.filter((schedule) => schedule.id !== button.dataset.id);
    updateScheduleList();
});

lodgeList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='remove-lodge']");
    if (!button) return;
    if (!await removeRecord("lodges", button.dataset.id, "lodge")) return;
    lodges = lodges.filter((lodge) => lodge.id !== button.dataset.id);
    updateLodgeList();
});

document.querySelector("#location-toggle").addEventListener("click", () => {
    if (locationWatchId !== null) {
        stopLocationSharing("Location sharing stopped.");
        return;
    }
    startLocationSharing();
});

window.addEventListener("pagehide", () => {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
    }
});

renderPlaces();
updateParticipantList();
updateScheduleList();
updateLoginButton();
initializeAuthentication();
configurePwa();
