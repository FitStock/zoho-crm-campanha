// Shared, synthetic authenticated-user fixture for existing widget regressions.
const ownerSdk = {
  CONFIG: {
    getCurrentUser: async () => ({
      id: "9001",
      full_name: "Usuário de teste",
      status: "active",
    }),
  },
  API: {
    getAllUsers: async () => ({
      users: [{ id: "9001", full_name: "Usuário de teste", status: "active" }],
      info: { more_records: false },
    }),
  },
};
module.exports = ownerSdk;
