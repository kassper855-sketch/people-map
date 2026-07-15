from pathlib import Path
import os
import requests
from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# Локально данные сохраняются в people.db.
# На хостинге можно передать DATABASE_URL для PostgreSQL.
sqlite_path = Path(__file__).with_name("people.db")
database_url = os.getenv("DATABASE_URL", f"sqlite:///{sqlite_path}")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class Person(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(60), default="")
    address = db.Column(db.String(300), nullable=False)
    notes = db.Column(db.Text, default="")
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)

    def as_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone or "",
            "address": self.address,
            "notes": self.notes or "",
            "lat": self.lat,
            "lon": self.lon,
        }


def geocode(address: str):
    response = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": address, "format": "json", "limit": 1},
        headers={"User-Agent": "PeopleMapApp/1.0"},
        timeout=15,
    )
    response.raise_for_status()
    results = response.json()
    if not results:
        return None
    return float(results[0]["lat"]), float(results[0]["lon"])


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/people")
def list_people():
    people = Person.query.order_by(Person.id.desc()).all()
    return jsonify([person.as_dict() for person in people])


@app.post("/api/people")
def add_person():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    address = str(data.get("address", "")).strip()
    notes = str(data.get("notes", "")).strip()

    if not name or not address:
        return jsonify({"error": "Введите имя и адрес"}), 400

    try:
        coordinates = geocode(address)
    except requests.RequestException:
        return jsonify({"error": "Не удалось проверить адрес"}), 502

    if not coordinates:
        return jsonify({"error": "Адрес не найден. Укажите город, улицу и дом"}), 404

    person = Person(
        name=name,
        phone=phone,
        address=address,
        notes=notes,
        lat=coordinates[0],
        lon=coordinates[1],
    )
    db.session.add(person)
    db.session.commit()
    return jsonify(person.as_dict()), 201


@app.put("/api/people/<int:person_id>")
def edit_person(person_id: int):
    person = db.get_or_404(Person, person_id)
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", person.name)).strip()
    phone = str(data.get("phone", person.phone or "")).strip()
    address = str(data.get("address", person.address)).strip()
    notes = str(data.get("notes", person.notes or "")).strip()

    if not name or not address:
        return jsonify({"error": "Введите имя и адрес"}), 400

    if address != person.address:
        try:
            coordinates = geocode(address)
        except requests.RequestException:
            return jsonify({"error": "Не удалось проверить новый адрес"}), 502
        if not coordinates:
            return jsonify({"error": "Новый адрес не найден"}), 404
        person.lat, person.lon = coordinates

    person.name = name
    person.phone = phone
    person.address = address
    person.notes = notes
    db.session.commit()
    return jsonify(person.as_dict())


@app.delete("/api/people/<int:person_id>")
def delete_person(person_id: int):
    person = db.get_or_404(Person, person_id)
    db.session.delete(person)
    db.session.commit()
    return jsonify({"ok": True})


with app.app_context():
    db.create_all()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
