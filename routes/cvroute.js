
const express = require("express");
const router = express.Router();

const db = require("../database/db");
const verifyToken = require("../verifytoken");
const PDFDocument = require("pdfkit");


router.get("/my-cv", verifyToken, (req, res) => {
  console.log("[CV] GET /my-cv hit. user:", req.user);

  const userId = req.user.id;

  const sql = "SELECT * FROM cvs WHERE user_id = ? LIMIT 1";
  db.query(sql, [userId], (err, results) => {
    console.log(
      "[CV] GET /my-cv query done. err:",
      err,
      "rows:",
      results?.length
    );

    if (err) {
      console.error("Error fetching CV:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (!results || results.length === 0) {
      // No CV yet for this user
      return res.json(null);
    }

    // Return the row as JSON
    return res.json(results[0]);
  });
});


router.post("/my-cv", verifyToken, (req, res) => {
  console.log("[CV] POST /my-cv hit. user:", req.user);

  const userId = req.user.id;

  const {
    title,
    full_name,
    email,
    phone,
    summary,
    education,
    experience,
    skills,
    template_type,
    projects,
    achievements,
    training,
    certifications,
    contact_links,
  } = req.body;

  // First check if CV already exists for this user
  const checkSql = "SELECT id FROM cvs WHERE user_id = ? LIMIT 1";
  db.query(checkSql, [userId], (err, results) => {
    if (err) {
      console.error("Error checking CV:", err);
      return res.status(500).json({ message: "Server error" });
    }

    // If no CV -> INSERT
    if (!results || results.length === 0) {
      const insertSql = `
        INSERT INTO cvs (
          user_id, title, full_name, email, phone,
          summary, education, experience, skills, template_type,
          projects, achievements, training, certifications, contact_links
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `;

      db.query(
        insertSql,
        [
          userId,
          title,
          full_name,
          email,
          phone,
          summary,
          education,
          experience,
          skills,
          // default template if not provided
          template_type || "template1",
          projects,
          achievements,
          training,
          certifications,
          contact_links,
        ],
        (err2) => {
          if (err2) {
            console.error("Error inserting CV:", err2);
            return res.status(500).json({ message: "Server error" });
          }
          return res.status(201).json({ message: "CV created" });
        }
      );
    } else {
      // If CV exists -> UPDATE
      const cvId = results[0].id;

      const updateSql = `
        UPDATE cvs
        SET title = ?, full_name = ?, email = ?, phone = ?,
            summary = ?, education = ?, experience = ?, skills = ?, template_type = ?,
            projects = ?, achievements = ?, training = ?, certifications = ?, contact_links = ?
        WHERE id = ? AND user_id = ?
      `;

      db.query(
        updateSql,
        [
          title,
          full_name,
          email,
          phone,
          summary,
          education,
          experience,
          skills,
          template_type || "template1",
          projects,
          achievements,
          training,
          certifications,
          contact_links,
          cvId,
          userId,
        ],
        (err3) => {
          if (err3) {
            console.error("Error updating CV:", err3);
            return res.status(500).json({ message: "Server error" });
          }
          return res.json({ message: "CV updated" });
        }
      );
    }
  });
});


router.get("/my-cv/pdf", verifyToken, (req, res) => {
  console.log("[CV] GET /my-cv/pdf hit. user:", req.user);

  const userId = req.user.id;

  const sql = "SELECT * FROM cvs WHERE user_id = ? LIMIT 1";
  db.query(sql, [userId], (err, results) => {
    console.log("[CV] PDF query done. err:", err, "rows:", results?.length);

    if (err) return res.status(500).json({ message: "Server error" });
    if (!results || results.length === 0) {
      return res.status(404).json({ message: "No CV found" });
    }

    const cv = results[0];
    const templateType = cv.template_type || "template1"; // default

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=cv_${templateType}.pdf`
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    // choose layout by template_type
    switch (templateType) {
      case "template1":
        buildTemplate1(doc, cv);
        break;
      case "template2":
        buildTemplate2(doc, cv);
        break;
      case "template3":
        buildTemplate3(doc, cv);
        break;
      default:
        buildTemplate1(doc, cv);
        break;
    }

    doc.end();
  });
});

module.exports = router;


function buildTemplate1(doc, cv) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - margin * 2;

  const fullName = cv.full_name || "YOUR NAME";
  const [firstName, ...lastParts] = fullName.split(" ");
  const lastName = lastParts.join(" ");

  // Top thin black bar
  doc.save();
  doc.rect(margin, margin, contentWidth, 4).fill("#111111");
  doc.restore();

  // Big centered name
  doc
    .fontSize(18)
    .fillColor("#444444")
    .text(firstName.toUpperCase(), margin, margin + 16, {
      width: contentWidth,
      align: "center",
    });

  doc
    .fontSize(26)
    .fillColor("#000000")
    .text(lastName.toUpperCase(), {
      width: contentWidth,
      align: "center",
    });

  const yAfterName = doc.y + 8;

  // Horizontal line under name
  doc
    .moveTo(margin, yAfterName)
    .lineTo(pageWidth - margin, yAfterName)
    .stroke("#000000");

  // Column layout
  const leftWidth = contentWidth * 0.32; // ~32% left
  const gap = 25;
  const leftX = margin;
  let leftY = yAfterName + 16;

  const rightX = leftX + leftWidth + gap;
  let rightY = leftY;
  const rightWidth = contentWidth - leftWidth - gap;

  // Vertical divider
  doc
    .moveTo(leftX + leftWidth + gap / 2, yAfterName + 5)
    .lineTo(leftX + leftWidth + gap / 2, pageHeight - margin)
    .stroke("#d0d0d0");

  // ----- LEFT COLUMN -----
  // CONTACT
  doc.fontSize(10).fillColor("#000000").text("CONTACT", leftX, leftY, {
    width: leftWidth,
  });
  leftY = doc.y + 4;

  doc.fontSize(9).fillColor("#555555");
  if (cv.phone) {
    doc.text(cv.phone, leftX, leftY, { width: leftWidth, lineGap: 2 });
    leftY = doc.y + 2;
  }
  if (cv.email) {
    doc.text(cv.email, leftX, leftY, { width: leftWidth, lineGap: 2 });
    leftY = doc.y + 2;
  }
  if (cv.contact_links) {
    doc.text(cv.contact_links, leftX, leftY, { width: leftWidth, lineGap: 2 });
    leftY = doc.y + 12;
  }

  // EDUCATION
  doc.fontSize(10).fillColor("#000000").text("EDUCATION", leftX, leftY, {
    width: leftWidth,
  });
  leftY = doc.y + 4;

  doc
    .fontSize(9)
    .fillColor("#555555")
    .text(cv.education || "-", leftX, leftY, {
      width: leftWidth,
      lineGap: 2,
    });
  leftY = doc.y + 10;

  // small line separator
  doc
    .moveTo(leftX, leftY)
    .lineTo(leftX + leftWidth, leftY)
    .stroke("#000000");
  leftY += 10;

  // SKILLS
  doc.fontSize(10).fillColor("#000000").text("SKILLS", leftX, leftY, {
    width: leftWidth,
  });
  leftY = doc.y + 4;

  doc
    .fontSize(9)
    .fillColor("#555555")
    .text(cv.skills || "-", leftX, leftY, {
      width: leftWidth,
      lineGap: 2,
    });

  // ----- RIGHT COLUMN -----
  // PROFILE
  doc
    .fontSize(11)
    .fillColor("#000000")
    .text("PROFILE", rightX, rightY, { width: rightWidth });
  rightY = doc.y + 6;

  doc
    .fontSize(10)
    .fillColor("#555555")
    .text(cv.summary || "-", rightX, rightY, {
      width: rightWidth,
      lineGap: 3,
    });
  rightY = doc.y + 14;

  // WORK EXPERIENCE
  doc
    .fontSize(11)
    .fillColor("#000000")
    .text("WORK EXPERIENCE", rightX, rightY, { width: rightWidth });
  rightY = doc.y + 6;

  doc
    .fontSize(10)
    .fillColor("#555555")
    .text(cv.experience || "-", rightX, rightY, {
      width: rightWidth,
      lineGap: 3,
    });
}

// ===================================================================
// TEMPLATE 2
// Olivia-style: colored page background, white rounded card,
// gray bar headers for each section.
// ===================================================================
function buildTemplate2(doc, cv) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - margin * 2;

  // Page background
  doc.save();
  doc.rect(0, 0, pageWidth, pageHeight).fill("#f3f5ff");
  doc.restore();

  // White rounded card
  const cardX = margin - 10;
  const cardY = margin - 10;
  const cardWidth = pageWidth - (margin - 10) * 2;
  const cardHeight = pageHeight - (margin - 10) * 2;

  doc.save();
  doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 12).fill("#ffffff");
  doc.restore();

  // Text inside card
  doc.x = margin;
  doc.y = margin;

  // Name & title
  doc
    .fontSize(20)
    .fillColor("#000000")
    .text(cv.full_name || "YOUR NAME", {
      width: contentWidth,
    });

  doc
    .moveDown(0.3)
    .fontSize(11)
    .fillColor("#555555")
    .text(cv.title || "", {
      width: contentWidth,
    });

  // Contact line
  const contactLine = [cv.email, cv.phone, cv.contact_links]
    .filter(Boolean)
    .join("  |  ");
  if (contactLine) {
    doc
      .moveDown(0.3)
      .fontSize(9)
      .fillColor("#777777")
      .text(contactLine, { width: contentWidth });
  }

  doc.moveDown(1);

  // Sections
  addBarSection(doc, "WORK EXPERIENCE", cv.experience, margin, contentWidth);
  addBarSection(doc, "SKILLS", cv.skills, margin, contentWidth);
  addBarSection(doc, "EDUCATION", cv.education, margin, contentWidth);
  addBarSection(doc, "INTERESTS", cv.training, margin, contentWidth);
  addBarSection(doc, "AWARDS", cv.achievements, margin, contentWidth);
}

// Gray bar + regular text content
function addBarSection(doc, label, value, margin, contentWidth) {
  if (!value) return;

  const startY = doc.y + 8;

  // Gray bar background
  doc.save();
  doc.rect(margin, startY, contentWidth, 18).fill("#f0f0f0");
  doc.restore();

  // Section label on bar
  doc
    .fontSize(11)
    .fillColor("#333333")
    .text(label.toUpperCase(), margin + 8, startY + 4, {
      width: contentWidth - 16,
    });

  // Content below bar
  doc.x = margin;
  doc.y = startY + 22;

  doc
    .fontSize(10)
    .fillColor("#444444")
    .text(String(value), {
      width: contentWidth,
      lineGap: 3,
    });
}


function buildTemplate3(doc, cv) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - margin * 2;

  // Centered header
  doc
    .fontSize(24)
    .fillColor("#000000")
    .text(cv.full_name || "YOUR NAME", margin, margin, {
      width: contentWidth,
      align: "center",
    });

  doc
    .moveDown(0.3)
    .fontSize(11)
    .fillColor("#555555")
    .text(cv.title || "", {
      width: contentWidth,
      align: "center",
    });

  const contactParts = [cv.email, cv.phone, cv.contact_links].filter(Boolean);
  if (contactParts.length) {
    doc
      .moveDown(0.3)
      .fontSize(9)
      .fillColor("#777777")
      .text(contactParts.join("  •  "), {
        width: contentWidth,
        align: "center",
      });
  }

  doc.moveDown(1.2);

  // Now sections, stacked vertically
  addMinimalSection(doc, "PROFILE", cv.summary, margin, contentWidth);
  addMinimalSection(doc, "EXPERIENCE", cv.experience, margin, contentWidth);
  addMinimalSection(doc, "EDUCATION", cv.education, margin, contentWidth);
  addMinimalSection(doc, "SKILLS", cv.skills, margin, contentWidth);
  addMinimalSection(doc, "PROJECTS", cv.projects, margin, contentWidth);
  addMinimalSection(doc, "ACHIEVEMENTS", cv.achievements, margin, contentWidth);
  addMinimalSection(doc, "TRAINING", cv.training, margin, contentWidth);
  addMinimalSection(doc, "CERTIFICATIONS", cv.certifications, margin, contentWidth);
}

function addMinimalSection(doc, label, value, margin, contentWidth) {
  if (!value) return;

  doc
    .moveDown(0.8)
    .fontSize(11)
    .fillColor("#000000")
    .text(label, {
      width: contentWidth,
      align: "left",
      characterSpacing: 1.2,
    });

  doc
    .moveDown(0.2)
    .fontSize(10)
    .fillColor("#444444")
    .text(String(value), {
      width: contentWidth,
      align: "left",
      lineGap: 4,
    });
}