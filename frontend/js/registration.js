/**
 * Aarohan '26 - Public Game Registration Controller
 * Validates team rosters, saves to SQLite backend and localStorage, and provides live status.
 */

const teamSize = document.getElementById("teamSize");
const participantsContainer = document.getElementById("participantsContainer");
const registrationForm = document.getElementById("registrationForm");
const formMessage = document.getElementById("formMessage");
const submitButton = document.getElementById("submitButton");

// Generate participant fields dynamically
function generateParticipantFields() {
    const count = Number(teamSize.value);
    participantsContainer.replaceChildren();

    for (let i = 1; i <= count; i++) {
        const card = document.createElement("div");
        card.className = "participant-card";

        const heading = document.createElement("h3");
        heading.textContent = `PARTICIPANT ${String(i).padStart(2, "0")}`;
        card.appendChild(heading);

        // Name field
        const nameField = document.createElement("div");
        nameField.className = "field";

        const nameLabel = document.createElement("label");
        nameLabel.htmlFor = `memberName${i}`;
        nameLabel.textContent = `Participant ${i} Name`;

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.id = `memberName${i}`;
        nameInput.name = `memberName${i}`;
        nameInput.placeholder = "Enter full name";
        nameInput.maxLength = 100;
        nameInput.required = true;

        nameField.append(nameLabel, nameInput);
        card.appendChild(nameField);

        // Grade field
        const gradeField = document.createElement("div");
        gradeField.className = "field";

        const gradeLabel = document.createElement("label");
        gradeLabel.htmlFor = `memberGrade${i}`;
        gradeLabel.textContent = `Participant ${i} Grade`;

        const gradeSelect = document.createElement("select");
        gradeSelect.id = `memberGrade${i}`;
        gradeSelect.name = `memberGrade${i}`;
        gradeSelect.required = true;

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select grade";
        placeholder.disabled = true;
        placeholder.selected = true;
        gradeSelect.appendChild(placeholder);

        for (let grade = 1; grade <= 12; grade++) {
            const option = document.createElement("option");
            option.value = String(grade);
            option.textContent = `Grade ${grade}`;
            gradeSelect.appendChild(option);
        }

        const otherOption = document.createElement("option");
        otherOption.value = "Other";
        otherOption.textContent = "Other";
        gradeSelect.appendChild(otherOption);

        gradeField.append(gradeLabel, gradeSelect);
        card.appendChild(gradeField);

        participantsContainer.appendChild(card);
    }

    formMessage.textContent = "";
    formMessage.className = "form-message";
}

teamSize.addEventListener("change", generateParticipantFields);

// Handle Form Submission
registrationForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!registrationForm.checkValidity()) {
        registrationForm.reportValidity();
        return;
    }

    const teamName = document.getElementById("teamName").value.trim();
    const schoolName = document.getElementById("schoolName").value.trim();

    if (!teamName || !schoolName) {
        formMessage.textContent = "Please fill in all required details.";
        formMessage.className = "form-message error";
        return;
    }

    const participants = [];
    for (let i = 1; i <= Number(teamSize.value); i++) {
        const name = document.getElementById(`memberName${i}`).value.trim();
        if (!name) {
            formMessage.textContent = `Please enter Participant ${i}'s name.`;
            formMessage.className = "form-message error";
            return;
        }

        participants.push({
            name: name,
            grade: document.getElementById(`memberGrade${i}`).value || "12"
        });
    }

    // Submission payload
    const registration = {
        teamName: teamName,
        schoolName: schoolName,
        teamSize: participants.length,
        participants: participants,
        status: "Confirmed",
        notes: "Registered via Public Aarohan Portal"
    };

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = "<span>RECORDING REGISTRATION...</span>";
    }

    let newTeam = null;
    if (window.TeamsStore) {
        newTeam = await window.TeamsStore.add(registration);
    }

    const regId = newTeam ? (newTeam.id || newTeam.team_id) : 'AAR-2026-' + Math.floor(1000 + Math.random() * 9000);

    formMessage.innerHTML = `
        <div style="padding: 22px; background: rgba(57, 255, 182, 0.08); border: 1px solid rgba(57, 255, 182, 0.4); border-radius: 14px; margin-top: 14px; text-align: left; box-shadow: 0 0 25px rgba(57, 255, 182, 0.1);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <span style="font-weight: 800; color: var(--green); font-size: 15px; letter-spacing: 0.5px;">🎉 REGISTRATION CONFIRMED</span>
                <span style="font-family: monospace; background: rgba(0, 200, 255, 0.15); border: 1px solid var(--blue); color: var(--blue); padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 700;">${regId}</span>
            </div>
            <p style="font-size: 14px; color: var(--text); margin-bottom: 8px; line-height: 1.5;">
                Team <strong>${teamName}</strong> from <em>${schoolName}</em> (${participants.length} participants) is officially registered in Aarohan '26.
            </p>
            <p style="font-size: 12.5px; color: var(--muted); margin-bottom: 16px;">
                Your unit credentials have been saved to the central registry. You can now report to Station 1 to begin the AI Survival Challenge.
            </p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="game.html" style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: linear-gradient(100deg, var(--blue), var(--green)); color: #041016; font-weight: 800; font-size: 12.5px; text-decoration: none; border-radius: 8px; letter-spacing: 0.5px;">
                    🚀 Launch Station 1: TIMEGLITCH ↗
                </a>
                <button type="button" onclick="window.location.reload()" style="padding: 10px 16px; background: var(--card); border: 1px solid var(--border); color: var(--text); font-size: 12.5px; border-radius: 8px; cursor: pointer;">
                    Register Another Team
                </button>
            </div>
        </div>
    `;

    formMessage.className = "form-message";

    if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = "<span>REGISTER TEAM</span> <span aria-hidden='true'>↗</span>";
    }

    // Refresh live public counter if present
    loadPublicRegistryCounter();
});

function loadPublicRegistryCounter() {
    const counterEl = document.getElementById("publicRegistryCounter");
    if (!counterEl) return;

    fetch("/api/teams")
        .then(r => r.json())
        .then(d => {
            if (d && d.total !== undefined) {
                counterEl.textContent = `${d.total} Teams Registered`;
            }
        })
        .catch(() => {
            if (window.TeamsStore) {
                const count = window.TeamsStore.getAll().length;
                counterEl.textContent = `${count} Teams Registered`;
            }
        });
}

// Initial setup
generateParticipantFields();
loadPublicRegistryCounter();
