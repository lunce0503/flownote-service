package kr.flownote.remote.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kr.flownote.remote.connection.HostProfile
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class ProfileStore(context: Context) {
    private val preferences = context.getSharedPreferences("remote-host-private", Context.MODE_PRIVATE)
    private val alias = "flownote-remote-profile-v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    fun save(profile: HostProfile) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(profile.validated().json().toString().toByteArray(Charsets.UTF_8))
        check(preferences.edit().putString("profile", Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)).commit())
    }
    fun load(): HostProfile? {
        val value = preferences.getString("profile", null) ?: return null
        val bytes = Base64.decode(value, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        }
        return HostProfile.fromJson(JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)))
    }
    fun rememberedSession(): String? = preferences.getString("session", null)
    fun rememberSession(id: String?) { check(preferences.edit().putString("session", id).commit()) }
    fun clear() { check(preferences.edit().clear().commit()) }
}
