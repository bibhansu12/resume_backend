const express = require('express');
const db = require('../database/db');
const verifyToken = require('../verifytoken');

const router = express.Router();

router.get('/',verifyToken, async(req,res) =>{
    if(req.user.role !== 'candidate'){
        return res.status(403).json({message:'candidate access only'});
    }

    const candidateId = req.user.id;

    try {
    const [rows] = await db.query(
      `SELECT n.*, j.title AS job_title, j.company AS job_company
       FROM notifications n
       JOIN jobs j ON n.job_id = j.id
       WHERE n.candidate_id = ?
       ORDER BY n.created_at DESC`,
      [candidateId]
    );
    res.json(rows);

    } catch(err){
        console.error('get notification error:', err);
        res.status(500).json({message:'Server error'});
    }
});

router.patch ('/:id/read', verifyToken, async (req, res) => {
    if (req.user.role != 'candidate'){
        return res.status(403).json({message:'candidate access only'});

    }
    const candidateId = req.user.id;
    const {id} = req.params;

    try{
        const [check] = await db.query(
            'SELECT * FROM notifications WHERE id = ? AND candidate_id = ?',
            [id,candidateId]
        );
        if( check.length === 0){
            return res.status(404).json({ message: 'Notification not found' });
        }
        await db.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);

        const [rows] = await db.query(
            'SELECT * FROM notifications WHERE id = ?',
             [id]
        );
        res.json(rows[0]);
    } catch(err){
        console.error('Update notification error:', err);
        res.status(500).json({ message: 'Server error' });
    }

    });
    module.exports = router;


    

