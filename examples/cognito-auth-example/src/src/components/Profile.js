import React, { useState, useEffect } from 'react';
import { fetchUserAttributes, updateUserAttributes } from 'aws-amplify/auth';

function Profile({ user, authTokens }) {
  const [attributes, setAttributes] = useState({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadUserAttributes();
  }, []);

  const loadUserAttributes = async () => {
    try {
      const userAttributes = await fetchUserAttributes();
      setAttributes(userAttributes);
      setFormData(userAttributes);
    } catch (error) {
      console.error('Error fetching user attributes:', error);
      setMessage({ type: 'error', text: 'Failed to load user attributes' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setMessage(null);

    try {
      // Only update attributes that have changed
      const updatedAttributes = {};
      Object.keys(formData).forEach(key => {
        if (formData[key] !== attributes[key] && formData[key] !== '') {
          updatedAttributes[key] = formData[key];
        }
      });

      if (Object.keys(updatedAttributes).length > 0) {
        await updateUserAttributes({
          userAttributes: updatedAttributes
        });
        
        setAttributes({ ...attributes, ...updatedAttributes });
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setEditMode(false);
      } else {
        setMessage({ type: 'info', text: 'No changes to update' });
      }
    } catch (error) {
      console.error('Error updating user attributes:', error);
      setMessage({ type: 'error', text: `Failed to update profile: ${error.message}` });
    } finally {
      setUpdating(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (loading) {
    return (
      <div className="card">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>👤 User Profile</h2>
        <p>Manage your account information and preferences.</p>
        
        {message && (
          <div className={message.type}>
            {message.text}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>📝 Profile Information</h3>
          {!editMode ? (
            <button 
              onClick={() => setEditMode(true)} 
              className="btn"
            >
              ✏️ Edit Profile
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => {
                  setEditMode(false);
                  setFormData(attributes);
                  setMessage(null);
                }} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdate}
                className="btn"
                disabled={updating}
              >
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {editMode ? (
          <form onSubmit={handleUpdate}>
            <div style={{ display: 'grid', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Given Name:
                </label>
                <input
                  type="text"
                  name="given_name"
                  value={formData.given_name || ''}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Family Name:
                </label>
                <input
                  type="text"
                  name="family_name"
                  value={formData.family_name || ''}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Phone Number:
                </label>
                <input
                  type="tel"
                  name="phone_number"
                  value={formData.phone_number || ''}
                  onChange={handleInputChange}
                  placeholder="+1234567890"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </div>
            </div>
          </form>
        ) : (
          <div className="code-block">
{`Email: ${attributes.email || 'Not provided'}
Email Verified: ${attributes.email_verified || 'No'}
Given Name: ${attributes.given_name || 'Not provided'}
Family Name: ${attributes.family_name || 'Not provided'}
Name: ${attributes.name || 'Not provided'}
Phone Number: ${attributes.phone_number || 'Not provided'}
Phone Verified: ${attributes.phone_number_verified || 'No'}
Preferred Username: ${attributes.preferred_username || 'Not set'}
Last Modified: ${attributes.updated_at ? new Date(parseInt(attributes.updated_at) * 1000).toLocaleString() : 'Unknown'}`}
          </div>
        )}
      </div>

      <div className="card">
        <h3>🔐 Account Security</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <h4>✅ Email Verification</h4>
            <p>
              Status: {attributes.email_verified === 'true' ? (
                <span style={{ color: '#28a745' }}>Verified ✓</span>
              ) : (
                <span style={{ color: '#dc3545' }}>Not Verified ✗</span>
              )}
            </p>
          </div>
          
          <div className="feature-card">
            <h4>📱 Phone Verification</h4>
            <p>
              Status: {attributes.phone_number_verified === 'true' ? (
                <span style={{ color: '#28a745' }}>Verified ✓</span>
              ) : (
                <span style={{ color: '#dc3545' }}>Not Verified ✗</span>
              )}
            </p>
          </div>
          
          <div className="feature-card">
            <h4>🔑 Multi-Factor Auth</h4>
            <p>
              {attributes.phone_number ? 
                'SMS MFA Available' : 
                'Add phone number for SMS MFA'
              }
            </p>
          </div>
          
          <div className="feature-card">
            <h4>🏢 Account Type</h4>
            <p>
              {user.signInDetails?.loginId?.includes('@') ? 
                'Email Account' : 
                'Username Account'
              }
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>📊 Profile Statistics</h3>
        <div className="code-block">
{`Account Created: ${attributes.created_at ? new Date(parseInt(attributes.created_at) * 1000).toLocaleString() : 'Unknown'}
Last Updated: ${attributes.updated_at ? new Date(parseInt(attributes.updated_at) * 1000).toLocaleString() : 'Unknown'}
Username: ${user.username}
User ID: ${user.userId}
Sign-in Method: ${user.signInDetails?.loginId ? 'Email/Username' : 'Social Login'}`}
        </div>
      </div>

      <div className="info">
        <strong>🔒 Privacy Note:</strong> Your profile information is securely stored in AWS Cognito 
        and encrypted at rest. Only you have access to modify your personal information.
      </div>
    </div>
  );
}

export default Profile;
