// Unterdrücke console.error in Tests, da diese erwartete Fehlerfälle testen
// Die Fehler werden trotzdem korrekt behandelt, nur die Console-Outputs werden unterdrückt
const originalError = console.error;

beforeAll(() => {
  // Mock console.error um störende Outputs in Tests zu vermeiden
  console.error = () => {};
});

afterAll(() => {
  console.error = originalError;
});
