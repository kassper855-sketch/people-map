const map = L.map("map").setView([50.45, 30.52], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let people = [];
const markers = new Map();

const form = document.getElementById("personForm");
const personId = document.getElementById("personId");
const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const addressInput = document.getElementById("address");
const notesInput = document.getElementById("notes");
const searchInput = document.getElementById("search");
const list = document.getElementById("peopleList");
const count = document.getElementById("count");
const message = document.getElementById("message");
const saveButton = document.getElementById("saveButton");
const cancelButton = document.getElementById("cancelButton");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

function resetForm() {
  form.reset();
  personId.value = "";
  saveButton.textContent = "Добавить";
  cancelButton.classList.add("hidden");
}

function popup(person) {
  return `
    <div class="popup-title">${escapeHtml(person.name)}</div>
    ${person.phone ? `<div>Телефон: ${escapeHtml(person.phone)}</div>` : ""}
    <div>${escapeHtml(person.address)}</div>
    ${person.notes ? `<div style="margin-top:6px">${escapeHtml(person.notes)}</div>` : ""}
  `;
}

function updateMarker(person) {
  let marker = markers.get(person.id);
  if (!marker) {
    marker = L.marker([person.lat, person.lon]).addTo(map);
    markers.set(person.id, marker);
  } else {
    marker.setLatLng([person.lat, person.lon]);
  }
  marker.bindPopup(popup(person));
}

function renderPeople() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = people.filter(person =>
    `${person.name} ${person.phone} ${person.address} ${person.notes}`.toLowerCase().includes(query)
  );

  count.textContent = people.length;
  list.innerHTML = filtered.length ? filtered.map(person => `
    <article class="person" data-id="${person.id}">
      <h3>${escapeHtml(person.name)}</h3>
      ${person.phone ? `<p>${escapeHtml(person.phone)}</p>` : ""}
      <p>${escapeHtml(person.address)}</p>
      <div class="actions">
        <button class="edit" data-action="edit">Изменить</button>
        <button class="delete" data-action="delete">Удалить</button>
      </div>
    </article>
  `).join("") : "<p>Людей пока нет.</p>";
}

async function loadPeople() {
  const response = await fetch("/api/people");
  people = await response.json();
  people.forEach(updateMarker);
  renderPeople();

  if (people.length) {
    const bounds = L.latLngBounds(people.map(person => [person.lat, person.lon]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("Проверяю адрес...");

  const id = personId.value;
  const response = await fetch(id ? `/api/people/${id}` : "/api/people", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: nameInput.value,
      phone: phoneInput.value,
      address: addressInput.value,
      notes: notesInput.value
    })
  });

  const data = await response.json();
  if (!response.ok) {
    showMessage(data.error || "Ошибка", "error");
    return;
  }

  if (id) {
    people = people.map(person => person.id === data.id ? data : person);
  } else {
    people.unshift(data);
  }

  updateMarker(data);
  renderPeople();
  map.setView([data.lat, data.lon], 15);
  markers.get(data.id).openPopup();
  resetForm();
  showMessage("Сохранено", "success");
});

cancelButton.addEventListener("click", () => {
  resetForm();
  showMessage("");
});

searchInput.addEventListener("input", renderPeople);

list.addEventListener("click", async event => {
  const card = event.target.closest(".person");
  if (!card) return;

  const id = Number(card.dataset.id);
  const person = people.find(item => item.id === id);
  if (!person) return;

  const action = event.target.dataset.action;
  if (!action) {
    map.setView([person.lat, person.lon], 16);
    markers.get(id).openPopup();
    return;
  }

  if (action === "edit") {
    personId.value = person.id;
    nameInput.value = person.name;
    phoneInput.value = person.phone;
    addressInput.value = person.address;
    notesInput.value = person.notes;
    saveButton.textContent = "Сохранить";
    cancelButton.classList.remove("hidden");
  }

  if (action === "delete" && confirm(`Удалить ${person.name}?`)) {
    const response = await fetch(`/api/people/${id}`, { method: "DELETE" });
    if (response.ok) {
      people = people.filter(item => item.id !== id);
      const marker = markers.get(id);
      if (marker) map.removeLayer(marker);
      markers.delete(id);
      renderPeople();
      resetForm();
    }
  }
});

loadPeople().catch(() => showMessage("Не удалось загрузить данные", "error"));
