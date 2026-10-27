const helper = require("../helper/message");
const pool = require('../db');


exports.fetchMembers = async (req, res) => {
    const { search = "", gender = "", plan = "", payment = "", member = "", limit, offset } = req.query;
    const dbLimit = limit === 'ALL' ? 'ALL' : (isNaN(parseInt(limit, 10)) ? 10 : parseInt(limit, 10));
    const dbOffset = isNaN(parseInt(offset, 10)) ? 0 : parseInt(offset, 10);

    try {
        const globalCountQuery = `SELECT COUNT(*)::int AS total, COUNT(CASE WHEN gender = 'Male' THEN 1 END)::int AS male, COUNT(CASE WHEN gender = 'Female' THEN 1 END)::int AS female FROM members WHERE is_deleted = FALSE;`;
        const globalCountResult = await pool.query(globalCountQuery);
        const counts = globalCountResult.rows[0] || { total: 0, male: 0, female: 0 };

        let baseQuery = `FROM members`;
        let values = [];
        let conditions = [`is_deleted = FALSE`];

        if (search && search.trim() !== "") {
            const cleanSearch = search.trim().toLowerCase();
            if (cleanSearch !== "fit" && cleanSearch !== "fit-") {
                let processedSearch = cleanSearch;
                if (cleanSearch.startsWith("fit-")) {
                    processedSearch = cleanSearch.replace("fit-", "");
                } else if (cleanSearch.startsWith("fit")) {
                    processedSearch = cleanSearch.replace("fit", "");
                }

                let numericId = processedSearch.replace(/\D/g, "");
                if (numericId) {
                    numericId = parseInt(numericId, 10).toString();
                }

                if (numericId) {
                    const idx1 = values.length + 1;
                    const idx2 = values.length + 2;
                    const idx3 = values.length + 3;

                    values.push(numericId, `%${cleanSearch}%`, `%${cleanSearch}%`);
                    conditions.push(`(id::text = $${idx1} OR name ILIKE $${idx2} OR phone ILIKE $${idx3})`);
                } else {
                    const idx1 = values.length + 1;
                    const idx2 = values.length + 2;

                    values.push(`%${cleanSearch}%`, `%${cleanSearch}%`);
                    conditions.push(`(name ILIKE $${idx1} OR phone ILIKE $${idx2})`);
                }
            }
        }

        const addCondition = (field, value) => {
            if (value === undefined || value === null || value.toString().trim() === "") {
                return;
            }
            const cleanValue = value.toString().trim();
            values.push(cleanValue);
            if (field === "plan_id") {
                conditions.push(`${field} = $${values.length}`);
            } else {
                conditions.push(`${field} ILIKE $${values.length}`);
            }
        };

        addCondition('gender', gender);
        addCondition('plan_id', plan);
        addCondition('payment_status', payment);

        if (member && member.trim() !== "") {
            const filterType = member.trim().toLowerCase();
            if (filterType === "active") {
                conditions.push(`is_paused = FALSE AND plan_id IS NOT NULL AND expiry_date >= CURRENT_DATE`);
            } else if (filterType === "expired") {
                conditions.push(`is_paused = FALSE AND expiry_date < CURRENT_DATE`);
            } else if (filterType === "frozen") {
                conditions.push(`is_paused = TRUE`);
            } else if (filterType === "no_plan") {
                conditions.push(`(plan_id = 0 OR plan_id IS NULL)`);
            }
        }

        baseQuery += ` WHERE ` + conditions.join(" AND ");

        const countQuery = `SELECT COUNT(*)::int AS total_count ${baseQuery};`;
        const countResult = await pool.query(countQuery, values);
        const totalRows = countResult.rows[0]?.total_count || 0;

        if (totalRows === 0) {
            return res.status(200).json({ message: helper.dataMessage, data: [], totalRows: 0, globalCount: counts });
        }

        // let dataQuery = `SELECT id, name, phone, gender, payment_status, plan_id, is_paused, joining_date, expiry_date, CASE WHEN is_paused = TRUE THEN (expiry_date - pause_start_date) ELSE (expiry_date - CURRENT_DATE) END AS remaining_days ${baseQuery}`;
        let dataQuery = `SELECT id, name, phone, gender, joining_date ${baseQuery}`;
        dataQuery += ` ORDER BY created_at DESC`;

        if (dbLimit !== 'ALL') {
            dataQuery += ` LIMIT ${dbLimit} OFFSET ${dbOffset};`;
        } else {
            dataQuery += `;`;
        }

        const result = await pool.query(dataQuery, values);
        res.status(200).json({
            message: helper.fetchMessage,
            data: result.rows,
            totalRows: totalRows,
            globalCount: counts
        });
    } catch (error) {
        console.error("Error during fetch members:", error);
        res.status(500).json({ message: helper.serverMessage });
    }
};

exports.fetchMemberById = async (req, res) => {
    try {
        const id = req.params.id
        const fetchQuery = `SELECT m.id, m.name, m.phone, m.gender, m.payment_status, m.plan_id, m.joining_date, m.expiry_date, m.is_paused, 
            CASE WHEN m.is_paused = TRUE THEN (m.expiry_date - m.pause_start_date) ELSE (m.expiry_date - CURRENT_DATE) END AS remaining_days,
            COALESCE(b.total_amount, 0) AS total_amount, COALESCE(b.pay_amount, 0) AS pay_amount, COALESCE(b.remaining_amount, 0) AS remaining_amount
            FROM members m LEFT JOIN billings b ON m.id = b.member_id WHERE m.id = $1 AND m.is_deleted = FALSE ORDER BY b.created_at DESC LIMIT 1;`;
        const result = await pool.query(fetchQuery, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: helper.dataMessage });
        }
        res.status(200).json({
            message: helper.fetchMessage,
            data: result.rows[0]
        });
    } catch (error) {
        console.log("Error during fetch member by id:", error);
        res.status(500).json({ message: helper.serverMessage });
    }
}

exports.actionMember = async (req, res) => {
    const client = await pool.connect();
    try {
        const { name, phone, gender, plan_id, joining_date, expiry_date, is_paused, total_amount, pay_amount, remaining_amount, payment_status } = req.body
        const id = req.params.id

        const dbExpiryDate = expiry_date && String(expiry_date).trim() !== "" ? String(expiry_date).trim() : null;
        const dbPlanId = plan_id && String(plan_id).trim() !== "" ? parseInt(plan_id, 10) : null;

        const currentTotalAmount = Number(total_amount) || 0;
        const currentPayAmount = Number(pay_amount) || 0;
        const currentRemainingAmount = Number(remaining_amount) || 0;

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        await client.query('BEGIN');

        if (id && id !== "new") {
            const updateMemberQuery = `UPDATE members SET name = $1, phone = $2, gender = $3 WHERE id = $4 AND is_deleted = false;`;
            const updateMemberValues = [name, phone, gender, id];
            const memberResult = await client.query(updateMemberQuery, updateMemberValues);
            if (memberResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: helper.dataMessage });
            }

            const activeSubQuery = `SELECT id, is_paused, pause_start_date, expiry_date FROM subscriptions WHERE member_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1;`;
            const subResult = await client.query(activeSubQuery, [id]);

            if (subResult.rowCount > 0) {
                const currentSub = subResult.rows[0];
                let finalExpiryDate = dbExpiryDate || currentSub.expiry_date;
                let finalPauseStartDate = currentSub.pause_start_date;

                if (is_paused && !currentSub.is_paused) {
                    finalPauseStartDate = todayStr;
                    finalExpiryDate = currentSub.expiry_date;
                }
                else if (!is_paused && currentSub.is_paused) {
                    if (currentSub.expiry_date && currentSub.pause_start_date) {
                        const expiry = new Date(currentSub.expiry_date);
                        const pauseStart = new Date(currentSub.pause_start_date);
                        const timeDiff = expiry.getTime() - pauseStart.getTime();
                        const remainingDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                        if (remainingDays > 0) {
                            const newExpiry = new Date(today);
                            newExpiry.setDate(today.getDate() + remainingDays);
                            finalExpiryDate = newExpiry.toISOString().split('T')[0];
                        }
                    }
                    finalPauseStartDate = null;
                }

                const updateSubQuery = `UPDATE subscriptions SET is_paused = $1, pause_start_date = $2, expiry_date = $3 WHERE id = $4;`;
                const updateSubValues = [is_paused, finalPauseStartDate, finalExpiryDate, currentSub.id];
                await client.query(updateSubQuery, updateSubValues);
            }

            await client.query('COMMIT');
            return res.status(200).json({ message: helper.updateMessage });
        } else {
            const insertQuery = `INSERT INTO members (name, phone, gender, joining_date) VALUES ($1, $2, $3, $4) RETURNING id;`;
            const insertValues = [name, phone, gender, joining_date];
            const memberResult = await client.query(insertQuery, insertValues);
            const newMemberId = memberResult.rows[0].id;
            let newSubscriptionId = null;
            if (dbPlanId) {
                const insertSubQuery = `INSERT INTO subscriptions (member_id, plan_id, start_date, expiry_date, status) VALUES ($1, $2, $3, $4, $5) RETURNING id;`;
                const insertSubValues = [newMemberId, dbPlanId, joining_date, dbExpiryDate, 'active'];
                const subResult = await client.query(insertSubQuery, insertSubValues);
                newSubscriptionId = subResult.rows[0].id;
            }
            if (dbPlanId || currentTotalAmount > 0) {
                const invoiceNo = `INV-${Date.now()}`;
                const billingQuery = `INSERT INTO billings (invoice_no, member_id, subscription_id, total_amount, pay_amount, remaining_amount, payment_status) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
                const billingValues = [invoiceNo, newMemberId, newSubscriptionId, currentTotalAmount, currentPayAmount, currentRemainingAmount, payment_status];
                await client.query(billingQuery, billingValues);
            }
            await client.query('COMMIT');
            return res.status(201).json({ message: helper.insertMessage });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error during insert or update member:", error);
        res.status(500).json({ message: helper.serverMessage });
    } finally {
        client.release();
    }
}

exports.deleteMembers = async (req, res) => {
    try {
        const { ids } = req.body
        if (!ids || ids.length === 0) {
            return res.status(400).json({ message: "No IDs provided" });
        }
        const multipleDeleteQuery = `UPDATE members SET is_deleted = TRUE WHERE id = ANY($1::int[])`;
        await pool.query(multipleDeleteQuery, [ids]);
        res.status(200).json({
            message: ids.length === 1 ? helper.deleteMessage : helper.multiDeleteMessage
        })
    } catch (error) {
        console.error("Error during delete members:", error);
        res.status(500).json({ message: helper.serverMessage });
    }
}

exports.renewMember = async (req, res) => {
    try {
        const { plan_id, plan_start_date, total_amount, pay_amount, remaining_amount, payment_status, expiry_date } = req.body
        const id = req.params.id

        const dbExpiryDate = expiry_date && String(expiry_date).trim() !== "" ? String(expiry_date).trim() : null;
        const dbPlanStartDate = plan_start_date && String(plan_start_date).trim() !== "" ? String(plan_start_date).trim() : new Date().toISOString().split('T')[0];
        const dbPlanId = plan_id && String(plan_id).trim() !== "" ? parseInt(plan_id, 10) : null;

        const currentTotalAmount = Number(total_amount) || 0;
        const currentPayAmount = Number(pay_amount) || 0;
        const currentRemainingAmount = Number(remaining_amount) || 0;

        const oldQuery = `SELECT id FROM members WHERE id = $1;`;
        const oldResult = await pool.query(oldQuery, [id]);
        if (oldResult.rowCount === 0) {
            return res.status(404).json({ message: helper.dataMessage });
        }

        const updateQuery = `UPDATE members SET plan_id = $1, payment_status = $2, joining_date = $3, expiry_date = $4, is_paused = $5, pause_start_date = $6 WHERE id = $7;`;
        const updateValues = [dbPlanId, payment_status, dbPlanStartDate, dbExpiryDate, false, null, id];
        const result = await pool.query(updateQuery, updateValues);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: helper.dataMessage });
        }
        if (dbPlanId || currentTotalAmount > 0) {
            const invoiceNo = `INV-${Date.now()}`;
            const billingQuery = `INSERT INTO billings (invoice_no, member_id, plan_id, total_amount, pay_amount, remaining_amount, payment_status) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
            const billingValues = [invoiceNo, id, dbPlanId, currentTotalAmount, currentPayAmount, currentRemainingAmount, payment_status];
            await pool.query(billingQuery, billingValues);
        }
        return res.status(200).json({ message: helper.updateMessage });
    } catch (error) {
        console.error("Error during renew member:", error);
        res.status(500).json({ message: helper.serverMessage });
    }
}