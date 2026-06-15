import { useState, useEffect } from "react";
import "./App.css";

export default function App() {
  const [meals, setMeals] = useState([]);
  const [totalKcal, setTotalKcal] = useState(0);
  const [totalProtein, setTotalProtein] = useState(0);
  const [totalCarbs, setTotalCarbs] = useState(0);
  const [totalFat, setTotalFat] = useState(0);
  const [goalKcal, setGoalKcal] = useState(2000);
  const [goalProtein, setGoalProtein] = useState(150);
  const [dietType, setDietType] = useState("onderhoud");
  const [userName, setUserName] = useState("");
  const [activeTab, setActiveTab] = useState("text");
  const [mealInput, setMealInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [previousMeals, setPreviousMeals] = useState(() => JSON.parse(localStorage.getItem("previous_meals") || "[]"));
  const [scannedProduct, setScannedProduct] = useState(null);
  const [portionG, setPortionG] = useState(100);
  const [portionSuggestie, setPortionSuggestie] = useState("");
  const [fotoResult, setFotoResult] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [scanStatus, setScanStatus] = useState("Voer een barcode in om te testen");

  const remaining = Math.max(0, goalKcal - totalKcal);

  useEffect(() => {
    if (meals.length >= 2) {
      const now = new Date();
      const hourOfDay = now.getHours() + now.getMinutes() / 60;
      const eeturen = Math.max(hourOfDay - 7, 1);
      const resterendeUren = Math.max(22 - hourOfDay, 0);
      const ratePerUur = totalKcal / eeturen;
      const voorspeld = Math.round(totalKcal + ratePerUur * resterendeUren);
      const verschil = voorspeld - goalKcal;
      setPrediction({ voorspeld, verschil });
    } else {
      setPrediction(null);
    }
  }, [meals, totalKcal, goalKcal]);

  async function callClaude(prompt) {
    const resp = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await resp.json();
    return data.text;
  }

  async function callClaudeVision(prompt, imageBase64, mediaType) {
    const resp = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, imageBase64, mediaType }),
    });
    const data = await resp.json();
    return data.text;
  }

  function addMealToLog(meal) {
    setMeals((prev) => [...prev, meal]);
    setTotalKcal((prev) => prev + meal.kcal);
    setTotalProtein((prev) => prev + meal.protein);
    setTotalCarbs((prev) => prev + meal.carbs);
    setTotalFat((prev) => prev + meal.fat);
    getSuggestion([...meals, meal]);
  }

  function deleteMeal(i) {
    const m = meals[i];
    setMeals((prev) => prev.filter((_, idx) => idx !== i));
    setTotalKcal((prev) => prev - m.kcal);
    setTotalProtein((prev) => prev - m.protein);
    setTotalCarbs((prev) => prev - m.carbs);
    setTotalFat((prev) => prev - m.fat);
  }

  function resetDay() {
    if (meals.length > 0) {
      const updated = [...meals, ...previousMeals].slice(0, 10);
      setPreviousMeals(updated);
      localStorage.setItem("previous_meals", JSON.stringify(updated));
    }
    setMeals([]); setTotalKcal(0); setTotalProtein(0); setTotalCarbs(0); setTotalFat(0);
    setSuggestion(""); setPrediction(null);
  }

  function herlogMeal(i) {
    addMealToLog({ ...previousMeals[i] });
  }

  async function addMealText() {
    if (!mealInput.trim()) return;
    setLoading(true);
    setSuggestion("");
    try {
      const raw = await callClaude(`Geef de voedingswaarden voor: "${mealInput}". Alleen JSON, geen backticks: {"kcal": getal, "protein_g": getal, "carbs_g": getal, "fat_g": getal}`);
      const nutrition = JSON.parse(raw.replace(/```json|```/g, "").trim());
      addMealToLog({ name: mealInput, kcal: nutrition.kcal, protein: nutrition.protein_g, carbs: nutrition.carbs_g, fat: nutrition.fat_g });
      setMealInput("");
    } catch (e) { alert("Kon voedingswaarden niet ophalen."); }
    setLoading(false);
  }

  async function getSuggestion(currentMeals) {
    setSuggestionLoading(true);
    const summary = currentMeals.map((m) => `${m.name} (${Math.round(m.kcal)} kcal, ${Math.round(m.protein)}g eiwit)`).join("; ");
    const kcalTot = currentMeals.reduce((a, b) => a + b.kcal, 0);
    const protTot = currentMeals.reduce((a, b) => a + b.protein, 0);
    try {
      const text = await callClaude(`Iemand is bezig met ${dietType}, doel: ${goalKcal} kcal en ${goalProtein}g eiwit. Gegeten: ${summary}. Totaal: ${Math.round(kcalTot)} kcal, ${Math.round(protTot)}g eiwit. Resterend: ${Math.max(0, Math.round(goalKcal - kcalTot))} kcal. Geef 2-3 concrete suggesties in Nederlands, casual toon, max 4 zinnen.`);
      setSuggestion(text);
    } catch (e) {}
    setSuggestionLoading(false);
  }

  async function lookupBarcode(code) {
    if (!code) return;
    setScanStatus("Product opzoeken...");
    try {
      const resp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const data = await resp.json();
      if (data.status !== 1) { setScanStatus("Product niet gevonden."); return; }
      const n = data.product.nutriments || {};
      const product = {
        name: data.product.product_name || "Onbekend product",
        kcal_per_100: n["energy-kcal_100g"] || 0,
        protein_per_100: n["proteins_100g"] || 0,
        carbs_per_100: n["carbohydrates_100g"] || 0,
        fat_per_100: n["fat_100g"] || 0,
      };
      setScannedProduct(product);
      setScanStatus("Product gevonden!");
      const tip = await callClaude(`Product: ${product.name} (${Math.round(product.kcal_per_100)} kcal per 100g, ${Math.round(product.protein_per_100)}g eiwit per 100g). Persoon is bezig met ${dietType}, heeft nog ${Math.max(0, Math.round(goalKcal - totalKcal))} kcal over. Geef in één zin een concrete portie-aanbeveling in gram.`);
      setPortionSuggestie(tip);
    } catch (e) { setScanStatus("Fout bij ophalen product."); }
  }

  function addScannedProduct() {
    if (!scannedProduct) return;
    const f = portionG / 100;
    addMealToLog({ name: `${scannedProduct.name} (${portionG}g)`, kcal: scannedProduct.kcal_per_100 * f, protein: scannedProduct.protein_per_100 * f, carbs: scannedProduct.carbs_per_100 * f, fat: scannedProduct.fat_per_100 * f });
    setScannedProduct(null); setPortionSuggestie(""); setScanStatus("Voer een barcode in om te testen");
  }

  async function handleFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFotoPreview(URL.createObjectURL(file));
    setFotoResult(null);
    const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const raw = await callClaudeVision(`Analyseer deze maaltijdfoto. Persoon is bezig met ${dietType}. Geef ALLEEN JSON terug, geen backticks: {"maaltijd_naam": "beschrijving", "kcal": getal, "protein_g": getal, "carbs_g": getal, "fat_g": getal, "opmerking": "één zin"}`, base64, file.type);
      const nutrition = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setFotoResult(nutrition);
    } catch (e) { alert("Kon foto niet analyseren."); }
  }

  function addFotoMeal() {
    if (!fotoResult) return;
    addMealToLog({ name: fotoResult.maaltijd_naam, kcal: fotoResult.kcal, protein: fotoResult.protein_g, carbs: fotoResult.carbs_g, fat: fotoResult.fat_g });
    setFotoResult(null); setFotoPreview(null);
  }

  const barKcal = Math.min(100, Math.round((totalKcal / goalKcal) * 100));
  const barProtein = Math.min(100, Math.round((totalProtein / goalProtein) * 100));

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "1.5rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: "1.5rem" }}>
        Voedingstracker <span style={{ fontSize: 11, background: "#e6f4ea", color: "#1a7f3c", padding: "2px 8px", borderRadius: 10, marginLeft: 8 }}>AI-powered</span>
      </h2>

      <div style={card}>
        <p style={label}>Jouw dagdoel</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={smallLabel}>Calorieëndoel (kcal)</label><input type="number" value={goalKcal} onChange={e => setGoalKcal(parseInt(e.target.value) || 2000)} style={input} /></div>
          <div><label style={smallLabel}>Eiwitdoel (g)</label><input type="number" value={goalProtein} onChange={e => setGoalProtein(parseInt(e.target.value) || 150)} style={input} /></div>
          <div><label style={smallLabel}>Dieettype</label>
            <select value={dietType} onChange={e => setDietType(e.target.value)} style={input}>
              <option value="afvallen">Afvallen</option>
              <option value="spiermassa">Spiermassa opbouwen</option>
              <option value="onderhoud">Gewicht onderhouden</option>
              <option value="keto">Keto</option>
            </select>
          </div>
          <div><label style={smallLabel}>Naam</label><input type="text" value={userName} onChange={e => setUserName(e.target.value)} placeholder="bijv. Nabiel" style={input} /></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: "1.25rem" }}>
        {[
          { val: Math.round(totalKcal), lbl: "kcal gegeten", bar: barKcal, color: "#378ADD" },
          { val: Math.round(totalProtein) + "g", lbl: "eiwit", bar: barProtein, color: "#1D9E75" },
          { val: remaining, lbl: "kcal over" },
        ].map((m, i) => (
          <div key={i} style={{ background: "#f5f5f5", borderRadius: 10, padding: "0.75rem 1rem" }}>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{m.val}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{m.lbl}</div>
            {m.bar !== undefined && <div style={{ background: "#e0e0e0", borderRadius: 4, height: 8, marginTop: 8, overflow: "hidden" }}><div style={{ width: m.bar + "%", height: 8, background: m.color, borderRadius: 4, transition: "width 0.3s" }} /></div>}
          </div>
        ))}
      </div>

      {prediction && (
        <div style={{ ...infoBox, background: Math.abs(prediction.verschil) < 100 ? "#e6f4ea" : prediction.verschil > 0 ? "#fff8e1" : "#e3f2fd", borderColor: Math.abs(prediction.verschil) < 100 ? "#a8d5b5" : prediction.verschil > 0 ? "#ffe082" : "#90caf9", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>📈 Voorspelling einde dag</div>
          <span style={{ fontSize: 14 }}>
            {Math.abs(prediction.verschil) < 100 ? `Je eindigt op ~${prediction.voorspeld} kcal — precies op doel!` : prediction.verschil > 0 ? `Je eindigt op ~${prediction.voorspeld} kcal — ${prediction.verschil} boven je doel.` : `Je eindigt op ~${prediction.voorspeld} kcal — ${Math.abs(prediction.verschil)} onder je doel. Je hebt nog ruimte.`}
          </span>
        </div>
      )}

      {previousMeals.length > 0 && (
        <div style={{ ...card, marginBottom: "1.25rem" }}>
          <p style={label}>🔁 Snel opnieuw loggen</p>
          {previousMeals.slice(0, 4).map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < 3 ? "0.5px solid #eee" : "none", fontSize: 14 }}>
              <span>{m.name}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#666" }}>{Math.round(m.kcal)} kcal</span>
                <button onClick={() => herlogMeal(i)} style={smallBtn}>+ Opnieuw</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <p style={label}>Maaltijd toevoegen</p>
        <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
          {["text", "scan", "foto"].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{ ...tabBtn, ...(activeTab === t ? tabActive : {}) }}>
              {t === "text" ? "✏️ Typen" : t === "scan" ? "📷 Barcode" : "🖼️ Foto"}
            </button>
          ))}
        </div>

        {activeTab === "text" && (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={mealInput} onChange={e => setMealInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addMealText()} placeholder="bijv. 2 eieren met toast" style={{ ...input, flex: 1 }} />
            <button onClick={addMealText} disabled={loading} style={primaryBtn}>{loading ? "Berekenen..." : "Voeg toe ↗"}</button>
          </div>
        )}

        {activeTab === "scan" && (
          <div>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{scanStatus}</p>
            {scannedProduct && (
              <div style={{ background: "#e6f4ea", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{scannedProduct.name}</div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Per 100g: {Math.round(scannedProduct.kcal_per_100)} kcal | {Math.round(scannedProduct.protein_per_100)}g eiwit</div>
                {portionSuggestie && <div style={{ fontSize: 12, color: "#1a7f3c", marginTop: 6 }}>💡 {portionSuggestie}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                  <input type="number" value={portionG} onChange={e => setPortionG(parseInt(e.target.value) || 100)} style={{ ...input, width: 80 }} />
                  <span style={{ fontSize: 13, color: "#666" }}>gram = {Math.round(scannedProduct.kcal_per_100 * portionG / 100)} kcal</span>
                  <button onClick={addScannedProduct} style={{ ...primaryBtn, marginLeft: "auto" }}>Toevoegen ↗</button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input id="barcode-input" placeholder="Voer barcode in, bijv. 8712100849702" style={{ ...input, flex: 1 }} />
              <button onClick={() => lookupBarcode(document.getElementById("barcode-input").value)} style={primaryBtn}>Zoek op</button>
            </div>
          </div>
        )}

        {activeTab === "foto" && (
          <div>
            {fotoPreview && <img src={fotoPreview} alt="preview" style={{ width: "100%", borderRadius: 10, marginBottom: 10, maxHeight: 200, objectFit: "cover" }} />}
            {fotoResult && (
              <div style={{ background: "#e6f4ea", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{fotoResult.maaltijd_naam}</div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{Math.round(fotoResult.kcal)} kcal | {Math.round(fotoResult.protein_g)}g eiwit | {Math.round(fotoResult.carbs_g)}g koolhydraten</div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4, fontStyle: "italic" }}>{fotoResult.opmerking}</div>
                <button onClick={addFotoMeal} style={{ ...primaryBtn, marginTop: 10 }}>Toevoegen ↗</button>
              </div>
            )}
            <label style={{ ...primaryBtn, display: "block", textAlign: "center", cursor: "pointer" }}>
              📸 Foto kiezen of maken
              <input type="file" accept="image/*" capture="environment" onChange={handleFoto} style={{ display: "none" }} />
            </label>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ ...label, margin: 0 }}>Maaltijden van vandaag</p>
          <button onClick={resetDay} style={smallBtn}>🔄 Dag resetten</button>
        </div>
        {meals.length === 0
          ? <p style={{ fontSize: 13, color: "#999", padding: "8px 0" }}>Nog geen maaltijden toegevoegd.</p>
          : meals.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < meals.length - 1 ? "0.5px solid #eee" : "none", fontSize: 14 }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#666", whiteSpace: "nowrap" }}>{Math.round(m.kcal)} kcal | {Math.round(m.protein)}g eiwit</span>
                <button onClick={() => deleteMeal(i)} style={{ ...smallBtn, color: "#d32f2f", borderColor: "#ffcdd2" }}>🗑</button>
              </div>
            </div>
          ))}
      </div>

      {(suggestion || suggestionLoading) && (
        <div style={infoBox}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>💡 AI-suggestie{userName ? ` voor ${userName}` : ""}</div>
          {suggestionLoading ? <span style={{ fontSize: 14 }}>Analyseren...</span> : <span style={{ fontSize: 14, lineHeight: 1.6 }}>{suggestion}</span>}
        </div>
      )}
    </div>
  );
}

const card = { background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.25rem" };
const label = { fontSize: 13, color: "#666", marginBottom: 6 };
const smallLabel = { fontSize: 13, color: "#666", display: "block", marginBottom: 4 };
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "0.5px solid #ccc", fontSize: 14, fontFamily: "system-ui" };
const primaryBtn = { background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, cursor: "pointer", fontFamily: "system-ui" };
const smallBtn = { background: "transparent", border: "0.5px solid #ccc", borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer", fontFamily: "system-ui" };
const tabBtn = { padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", border: "0.5px solid #ccc", background: "transparent", fontFamily: "system-ui" };
const tabActive = { background: "#e8f0fe", color: "#1a73e8", borderColor: "#a8c5f8" };
const infoBox = { background: "#e8f0fe", border: "0.5px solid #a8c5f8", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.25rem" };