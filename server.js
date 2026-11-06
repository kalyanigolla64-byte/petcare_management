const express=require("express"),mysql=require("mysql2/promise"),path=require("path");
const app=express(),PORT=3000;
app.use(express.json());app.use(express.static(path.join(__dirname,"public")));
const db=mysql.createPool({host:"localhost",user:"root",password:"2525",database:"petcare_management",waitForConnections:true,connectionLimit:10});
const cfg={
 owners:{id:"owner_id",fields:["owner_name","phone","email","address","created_date"],required:["owner_name"]},
 pets:{id:"pet_id",fields:["owner_id","pet_name","species","age","gender","registration_date"],required:["owner_id","pet_name"]},
 appointments:{id:"appointment_id",fields:["owner_id","pet_id","appointment_date","reason","status","booking_date"],required:["owner_id","pet_id","appointment_date"]}
};
// Repair common legacy-schema issues before accepting API requests.
// CREATE TABLE IF NOT EXISTS does not update tables that already exist.
async function ensureColumn(table, column, definition) {
 const [cols] = await db.query("SHOW COLUMNS FROM `" + table + "`");
 if (!cols.some(c => c.Field === column)) {
  await db.query("ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + definition);
 }
}
async function ensureAutoIncrement(table, column) {
 const [cols] = await db.query("SHOW COLUMNS FROM `" + table + "`");
 const col = cols.find(c => c.Field === column);
 if (!col) throw new Error("Required column " + table + "." + column + " is missing. Import database.sql first.");
 const [indexes] = await db.query("SHOW INDEX FROM `" + table + "`");
 if (!indexes.some(i => i.Column_name === column && i.Non_unique === 0)) {
  if (!indexes.some(i => i.Key_name === "PRIMARY")) {
   await db.query("ALTER TABLE `" + table + "` ADD PRIMARY KEY (`" + column + "`)");
  } else {
   await db.query("ALTER TABLE `" + table + "` ADD UNIQUE KEY (`" + column + "`)");
  }
 }
 if (String(col.Extra || "").toLowerCase().includes("auto_increment")) return;
 const type = String(col.Type || "int").toUpperCase();
 if (!/^INT(?:\\(\\d+\\))?(?: UNSIGNED)?$/.test(type)) {
  throw new Error("Cannot safely auto-increment " + table + "." + column + " because its type is " + col.Type + ".");
 }
 await db.query("ALTER TABLE `" + table + "` MODIFY `" + column + "` " + type + " NOT NULL AUTO_INCREMENT");
}
async function repairLegacySchema() {
 await ensureColumn("pets", "species", "VARCHAR(100) NULL");
 await ensureAutoIncrement("owners", "owner_id");
 await ensureAutoIncrement("pets", "pet_id");
 await ensureAutoIncrement("appointments", "appointment_id");
}
const data=(t,b)=>Object.fromEntries(cfg[t].fields.filter(k=>b[k]!==undefined).map(k=>[k,b[k]===""?null:b[k]]));
app.get("/api/dashboard",async(q,s)=>{try{
 const [[o]] = await db.query("SELECT COUNT(*) total FROM owners"),[[p]]=await db.query("SELECT COUNT(*) total FROM pets"),[[a]]=await db.query("SELECT COUNT(*) total FROM appointments"),[[u]]=await db.query("SELECT COUNT(*) total FROM appointments WHERE appointment_date>=CURDATE() AND status='Scheduled'");
 const [recent]=await db.query("SELECT a.appointment_date,a.reason,a.status,o.owner_name,p.pet_name FROM appointments a JOIN owners o ON a.owner_id=o.owner_id JOIN pets p ON a.pet_id=p.pet_id ORDER BY a.appointment_date DESC LIMIT 6");
 s.json({owners:o.total,pets:p.total,appointments:a.total,upcoming:u.total,recent});
}catch(e){s.status(500).json({error:e.message})}});
app.get("/api/owners",async(q,s)=>{try{let [r]=await db.query("SELECT * FROM owners ORDER BY owner_id DESC");s.json(r)}catch(e){s.status(500).json({error:e.message})}});
app.get("/api/pets",async(q,s)=>{try{let [r]=await db.query("SELECT p.*,o.owner_name FROM pets p JOIN owners o ON p.owner_id=o.owner_id ORDER BY p.pet_id DESC");s.json(r)}catch(e){s.status(500).json({error:e.message})}});
app.get("/api/appointments",async(q,s)=>{try{let [r]=await db.query("SELECT a.*,o.owner_name,p.pet_name FROM appointments a JOIN owners o ON a.owner_id=o.owner_id JOIN pets p ON a.pet_id=p.pet_id ORDER BY a.appointment_date DESC");s.json(r)}catch(e){s.status(500).json({error:e.message})}});
app.get("/api/records",async(q,s)=>{try{let [owners]=await db.query("SELECT * FROM owners"),[pets]=await db.query("SELECT p.*,o.owner_name FROM pets p JOIN owners o ON p.owner_id=o.owner_id"),[appointments]=await db.query("SELECT a.*,o.owner_name,p.pet_name FROM appointments a JOIN owners o ON a.owner_id=o.owner_id JOIN pets p ON a.pet_id=p.pet_id");s.json({owners,pets,appointments})}catch(e){s.status(500).json({error:e.message})}});
// Search uses the columns that ACTUALLY exist in the connected MySQL tables.
// This avoids errors when an existing table has a slightly different schema
// (including databases that use species as the pet classification field).
const searchColumns = async (table) => {
 const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
 return rows.map(row => row.Field);
};
const searchCondition = (alias, columns, like) => {
 const usable = columns.filter(Boolean);
 return { sql: usable.map(col => `CAST(${alias}.\`${col}\` AS CHAR) LIKE ?`).join(" OR "), values: usable.map(() => like) };
};
app.get("/api/search", async (req, res) => {
 try {
  const term = String(req.query.q || "").trim();
  if (!term) return res.json({ owners: [], pets: [], appointments: [] });
  const like = `%${term}%`;
  const [ownerCols, petCols, appointmentCols] = await Promise.all([
   searchColumns("owners"), searchColumns("pets"), searchColumns("appointments")
  ]);

  // Owners: search every real owners-table column.
  const ow = searchCondition("o", ownerCols, like);
  const [owners] = await db.query(
   `SELECT o.* FROM owners o WHERE ${ow.sql} ORDER BY o.owner_id DESC`, ow.values
  );

  // Pets: search every real pets-table column and the related owner's name.
  const petCond = searchCondition("p", petCols, like);
  const ownerNameExists = ownerCols.includes("owner_name");
  const petWhere = [petCond.sql];
  const petValues = [...petCond.values];
  if (ownerNameExists) { petWhere.push("o.owner_name LIKE ?"); petValues.push(like); }
  const [pets] = await db.query(
   `SELECT p.*, ${ownerNameExists ? "o.owner_name" : "NULL AS owner_name"} FROM pets p
    LEFT JOIN owners o ON p.owner_id=o.owner_id
    WHERE (${petWhere.join(" OR ")}) ORDER BY p.pet_id DESC`, petValues
  );

  // Appointments: search every real appointment column plus related owner/pet names.
  const apptCond = searchCondition("a", appointmentCols, like);
  const appointmentWhere = [apptCond.sql];
  const appointmentValues = [...apptCond.values];
  if (ownerNameExists) { appointmentWhere.push("o.owner_name LIKE ?"); appointmentValues.push(like); }
  if (petCols.includes("pet_name")) { appointmentWhere.push("p.pet_name LIKE ?"); appointmentValues.push(like); }
  const [appointments] = await db.query(
   `SELECT a.*, ${ownerNameExists ? "o.owner_name" : "NULL AS owner_name"},
           ${petCols.includes("pet_name") ? "p.pet_name" : "NULL AS pet_name"}
    FROM appointments a
    LEFT JOIN owners o ON a.owner_id=o.owner_id
    LEFT JOIN pets p ON a.pet_id=p.pet_id
    WHERE (${appointmentWhere.join(" OR ")}) ORDER BY a.appointment_date DESC`, appointmentValues
  );
  res.json({ owners, pets, appointments });
 } catch (err) {
  console.error("Search API error:", err);
  res.status(500).json({ error: err.message });
 }
});

for(const t of Object.keys(cfg)){let c=cfg[t];
 app.post("/api/"+t,async(q,s)=>{try{let d=data(t,q.body);for(let f of c.required)if(!d[f])return s.status(400).json({error:f+" is required"});let k=Object.keys(d),[r]=await db.query(`INSERT INTO ${t} (${k.join(",")}) VALUES (${k.map(()=>"?").join(",")})`,Object.values(d));s.status(201).json({id:r.insertId})}catch(e){s.status(500).json({error:e.message})}});
 app.put("/api/"+t+"/:id",async(q,s)=>{try{let d=data(t,q.body),k=Object.keys(d);if(!k.length)return s.status(400).json({error:"No fields provided"});let [r]=await db.query(`UPDATE ${t} SET ${k.map(x=>x+"=?").join(",")} WHERE ${c.id}=?`,[...Object.values(d),q.params.id]);s.json({message:r.affectedRows?"Updated":"No record changed"})}catch(e){s.status(500).json({error:e.message})}});
 app.delete("/api/"+t+"/:id",async(q,s)=>{try{let [r]=await db.query(`DELETE FROM ${t} WHERE ${c.id}=?`,[q.params.id]);s.json({message:r.affectedRows?"Deleted":"Not found"})}catch(e){s.status(500).json({error:e.message})}});
}
app.get("/",(q,s)=>s.sendFile(path.join(__dirname,"public","index.html")));
repairLegacySchema().then(() => {
 app.listen(PORT,()=>console.log("PetCare running at http://localhost:"+PORT));
}).catch(err => {
 console.error("Database schema repair failed:", err.message);
 console.error("Check database.sql and ensure the configured MySQL user can ALTER the tables.");
 process.exit(1);
});