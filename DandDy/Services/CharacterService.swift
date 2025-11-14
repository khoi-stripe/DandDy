import Foundation

class CharacterService {
    static let shared = CharacterService()
    private init() {}
    
    private let apiClient = APIClient.shared
    
    func createCharacter(_ character: CharacterCreate) async throws -> Character {
        let newCharacter: Character = try await apiClient.request(
            endpoint: "/characters/",
            method: "POST",
            body: character
        )
        return newCharacter
    }
    
    func getCharacters() async throws -> [Character] {
        let characters: [Character] = try await apiClient.request(endpoint: "/characters/")
        return characters
    }
    
    func getCharacter(id: Int) async throws -> Character {
        let character: Character = try await apiClient.request(endpoint: "/characters/\(id)")
        return character
    }
    
    func updateCharacter(id: Int, updates: [String: Any]) async throws -> Character {
        // Convert updates dictionary to CharacterUpdate
        let jsonData = try JSONSerialization.data(withJSONObject: updates)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        
        let updatedCharacter: Character = try await apiClient.request(
            endpoint: "/characters/\(id)",
            method: "PUT",
            body: updates
        )
        return updatedCharacter
    }
    
    func deleteCharacter(id: Int) async throws {
        try await apiClient.requestNoResponse(
            endpoint: "/characters/\(id)",
            method: "DELETE"
        )
    }
}


