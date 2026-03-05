const User = require('../models/User');

async function searchStaffs(req, res) {
  try {
    const { search = "" } = req.query;

    const query = {
      role: "staff",
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const staffs = await User.find(query)
      .select("_id name email department")
      .limit(5)
      .sort({ name: 1 });

    return res.json(staffs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  searchStaffs,
};
